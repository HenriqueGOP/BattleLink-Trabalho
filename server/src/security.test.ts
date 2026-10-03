import assert from "node:assert/strict";
import { config } from "./config";
import {
  authenticate,
  ConnectionLimits,
  isAllowedOrigin,
  MessageBudget,
  validateServerConfig,
} from "./security";

validateServerConfig(config);
assert.throws(
  () =>
    validateServerConfig({ ...config, host: "0.0.0.0", accessToken: "", originsConfigured: false }),
  /BATTLE_ACCESS_TOKEN/,
);
assert.throws(() => validateServerConfig({ ...config, allowedOrigins: ["*"] }), /origens HTTP/);
assert.throws(() => validateServerConfig({ ...config, tcpHost: "0.0.0.0" }), /loopback/);
validateServerConfig({
  ...config,
  host: "0.0.0.0",
  accessToken: "x".repeat(32),
  originsConfigured: true,
  allowedOrigins: ["https://game.example"],
});
assert.equal(isAllowedOrigin(undefined, config.allowedOrigins), false);
assert.equal(isAllowedOrigin("http://evil.test", config.allowedOrigins), false);
assert.equal(isAllowedOrigin(config.allowedOrigins[0], config.allowedOrigins), true);
assert.equal(authenticate(undefined, "secret"), false);
assert.equal(authenticate("wrong", "secret"), false);
assert.equal(authenticate("secret", "secret"), true);
assert.equal(authenticate(undefined, ""), true);

const limits = new ConnectionLimits(2, 1);
const release1 = limits.acquire("127.0.0.1")!;
assert.equal(limits.acquire("::ffff:127.0.0.1"), null);
const release2 = limits.acquire("127.0.0.2")!;
assert.equal(limits.acquire("127.0.0.3"), null);
release1();
release1();
const release3 = limits.acquire("127.0.0.3")!;
assert.ok(release3);
assert.equal(limits.acquire("127.0.0.4"), null, "release duplicado não deve criar vagas extras");
release2();
release3();
const budget = new MessageBudget(2, 0);
assert.equal(budget.consume(0), true);
assert.equal(budget.consume(0), true);
assert.equal(budget.consume(0), false);
assert.equal(budget.consume(500), true);
assert.equal(budget.consume(500), false);
console.log("Security tests passed.");
