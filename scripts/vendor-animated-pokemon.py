"""Import existing Gen 5 Pokémon animation files from a pinned upstream tree.

Development tool only; runtime never contacts the upstream server. The original
PNG/cries registry is not changed. GIF frame structure is checked without an
image conversion step, preserving every upstream animation byte.
"""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "client/public/pokemon/animated"
REGISTRY = ROOT / "client/src/data/animated-registry.json"
SOURCE_ROOT = "sprites/pokemon/versions/generation-v/black-white/animated"
MAX_BYTES = 512 * 1024
VARIANTS = {"front": "", "back": "back/", "shinyFront": "shiny/", "shinyBack": "back/shiny/"}


def read(url, maximum=8 * 1024 * 1024):
    request = urllib.request.Request(url, headers={"User-Agent": "pokemon-battle-animation-importer", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(request, timeout=25) as response:
        contents = response.read(maximum + 1)
    if len(contents) > maximum:
        raise ValueError(f"Resource exceeds byte limit: {url}")
    return contents


def gif_metadata(contents):
    if contents[:6] not in (b"GIF87a", b"GIF89a") or len(contents) < 14:
        raise ValueError("Not a complete GIF")
    width = int.from_bytes(contents[6:8], "little")
    height = int.from_bytes(contents[8:10], "little")
    if not (0 < width <= 2048 and 0 < height <= 2048):
        raise ValueError("Unexpected dimensions")
    offset = 13 + (3 * (2 ** ((contents[10] & 7) + 1)) if contents[10] & 128 else 0)
    frames, durations, delay = 0, [], 100

    def skip_blocks(cursor):
        while cursor < len(contents):
            size = contents[cursor]
            cursor += 1
            if size == 0:
                return cursor
            cursor += size
            if cursor > len(contents):
                raise ValueError("Truncated GIF sub-block")
        raise ValueError("Missing GIF sub-block terminator")

    while offset < len(contents):
        token = contents[offset]
        offset += 1
        if token == 0x3B:
            if frames < 1:
                raise ValueError("GIF without image frames")
            return {"width": width, "height": height, "frames": frames, "durationMs": sum(durations)}
        if token == 0x21:
            if offset >= len(contents):
                raise ValueError("Truncated GIF extension")
            label = contents[offset]
            offset += 1
            if label == 0xF9 and offset + 6 <= len(contents) and contents[offset] == 4:
                delay = max(20, int.from_bytes(contents[offset + 2:offset + 4], "little") * 10)
            offset = skip_blocks(offset)
        elif token == 0x2C:
            if offset + 9 > len(contents):
                raise ValueError("Truncated image descriptor")
            packed = contents[offset + 8]
            offset += 9
            if packed & 128:
                offset += 3 * (2 ** ((packed & 7) + 1))
            offset += 1  # LZW minimum code size
            offset = skip_blocks(offset)
            frames += 1
            durations.append(delay)
            delay = 100
        else:
            raise ValueError(f"Unknown GIF block {token:02x}")
    raise ValueError("GIF trailer missing")


def upstream_tree(revision):
    cache = PUBLIC / "upstream-tree.json"
    if cache.exists():
        stored = json.loads(cache.read_text(encoding="utf-8"))
        if stored.get("revision") == revision:
            return stored["files"]
    # The contents endpoint truncates large directories to 1,000 entries and can
    # omit the animated folder. Resolve each directory through Git tree objects.
    sha = revision
    for segment in SOURCE_ROOT.split("/"):
        parent = json.loads(read(f"https://api.github.com/repos/PokeAPI/sprites/git/trees/{sha}"))
        if parent.get("truncated"):
            raise ValueError("Intermediate upstream tree was truncated")
        folder = next(entry for entry in parent["tree"] if entry["path"] == segment and entry["type"] == "tree")
        sha = folder["sha"]
    result = json.loads(read(f"https://api.github.com/repos/PokeAPI/sprites/git/trees/{sha}?recursive=1"))
    if result.get("truncated"):
        raise ValueError("Upstream tree was truncated; do not guess missing files")
    files = {entry["path"]: entry for entry in result["tree"] if entry["type"] == "blob"}
    PUBLIC.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({"revision": revision, "directorySha": sha, "files": files}, sort_keys=True) + "\n", encoding="utf-8")
    return files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inspect", action="store_true", help="Inspect the pinned tree without downloading animations")
    args = parser.parse_args()
    revision = json.loads((ROOT / "client/public/pokemon/sources.json").read_text(encoding="utf-8"))["sprites"]
    if not re.fullmatch(r"[a-f0-9]{40}", revision):
        raise ValueError("Sprites revision must be a fixed Git SHA")
    species = json.loads((ROOT / "server/src/data/species.json").read_text(encoding="utf-8"))
    tree = upstream_tree(revision)
    existing = [(entry["id"], kind, prefix + str(entry["num"]) + ".gif") for entry in species for kind, prefix in VARIANTS.items() if prefix + str(entry["num"]) + ".gif" in tree]
    tasks = [task for task in existing if tree[task[2]].get("size", MAX_BYTES + 1) <= MAX_BYTES]
    summary = {"revision": revision, "upstreamFiles": len(tree), "baseSpecies": len({task[0] for task in tasks}), "variants": len(tasks), "oversizedFallbacks": len(existing) - len(tasks), "upstreamBytes": sum(tree[task[2]].get("size", 0) for task in tasks)}
    print(json.dumps(summary), flush=True)
    if args.inspect:
        return
    PUBLIC.mkdir(parents=True, exist_ok=True)

    def download(task):
        species_id, kind, remote = task
        relative = kind + "/" + remote.rsplit("/", 1)[-1]
        target = PUBLIC / relative
        for attempt in range(3):
            try:
                contents = target.read_bytes() if target.exists() else read(f"https://raw.githubusercontent.com/PokeAPI/sprites/{revision}/{SOURCE_ROOT}/{remote}", MAX_BYTES)
                if len(contents) > MAX_BYTES:
                    raise ValueError("Animation too large")
                metadata = gif_metadata(contents)
                if metadata["frames"] <= 1:
                    return species_id, kind, None
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(contents)
                return species_id, kind, {"path": "/pokemon/animated/" + relative, **metadata, "bytes": len(contents), "sha256": hashlib.sha256(contents).hexdigest(), "upstreamPath": SOURCE_ROOT + "/" + remote, "upstreamBlob": tree[remote]["sha"]}
            except (urllib.error.URLError, TimeoutError, OSError):
                if attempt == 2:
                    raise
                time.sleep(0.3 * (attempt + 1))

    manifest = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for index, (species_id, kind, animation) in enumerate(pool.map(download, tasks), 1):
            if animation:
                manifest.setdefault(species_id, {})[kind] = animation
            if index % 200 == 0:
                print(f"Animated local assets: {index}/{len(tasks)}", flush=True)
    (PUBLIC / "manifest.json").write_text(json.dumps(manifest, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    registry = {species_id: {kind: {key: value[key] for key in ("path", "width", "height", "frames", "durationMs")} for kind, value in variants.items()} for species_id, variants in manifest.items()}
    REGISTRY.write_text(json.dumps(registry, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    (PUBLIC / "sources.json").write_text(json.dumps({"repository": "https://github.com/PokeAPI/sprites", "revision": revision, "directory": SOURCE_ROOT, "format": "Unmodified animated GIF", "licenseNotice": "../sprites-LICENSE.txt", "maximumBytes": MAX_BYTES, "workers": 8}, indent=2) + "\n", encoding="utf-8")
    (PUBLIC / "CREDITS.md").write_text(f"# Sprites animados Pokémon\n\nArquivos GIF preservados, sem redesenho, conversão ou remoção de frames, de [PokeAPI/sprites](https://github.com/PokeAPI/sprites/tree/{revision}/{SOURCE_ROOT}), revisão fixa `{revision}`.\n\nDireção visual: sprites de batalha animados da geração V (Black/White), incluindo variantes frontais, traseiras e shiny que realmente existem na árvore upstream. Somente GIFs com mais de um frame foram incluídos. Espécies sem versão animada mantêm o PNG local como fallback. Os 5.125 recursos originais não foram alterados.\n\nManifesto: `manifest.json`, com dimensão, contagem de frames, duração, bytes, SHA-256 e origem individual. Catálogo seguro: `client/src/data/animated-registry.json`. Importador: `scripts/vendor-animated-pokemon.py`, com oito trabalhadores e limite de 512 KiB por arquivo. Nenhum download de sprites ocorre no jogo.\n\nOs avisos upstream são preservados em `../sprites-LICENSE.txt`. Pokémon e personagens pertencem aos respectivos titulares; a licença do repositório não concede direitos adicionais sobre essas marcas/personagens.\n", encoding="utf-8")
    print(json.dumps({"animatedSpecies": len(manifest), "animatedFiles": sum(len(variants) for variants in manifest.values()), "animatedBytes": sum(item["bytes"] for variants in manifest.values() for item in variants.values())}), flush=True)


if __name__ == "__main__":
    main()
