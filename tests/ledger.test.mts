// 台帳の形（P24）: 台帳本体の「主題の索引」と主題ファイル（docs/rules/）が1対1で、索引から辿れること。
// 中身（決まりの文）は見ない。上限の字数は CLAUDE.md「台帳の維持」の手順で測る（テストで止めない）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const ledger = readFileSync("memo-okoshi-handoff.md", "utf8");
const index = ledger.slice(ledger.indexOf("## 主題の索引"), ledger.indexOf("## ロードマップ"));
const rows = [...index.matchAll(/^\| (.+?) \| `(docs\/rules\/[^`]+)` \| (.+?) \|$/gm)].map((m) => ({ title: m[1], path: m[2], tests: m[3] }));

test("索引の行と docs/rules/ のファイルが1対1で、題が一致する", () => {
  assert.ok(rows.length > 0, "索引がある");
  const files = readdirSync("docs/rules").filter((f) => f.endsWith(".md")).map((f) => `docs/rules/${f}`).sort();
  assert.deepEqual(rows.map((r) => r.path).sort(), files, "索引に無いファイル・ファイルの無い索引が無い");
  for (const r of rows) {
    const head = readFileSync(r.path, "utf8").split("\n")[0];
    assert.equal(head, `# ${r.title}`, `${r.path} の見出しが索引と違う`);
  }
});

test("索引に挙げたテストは実在する", () => {
  for (const r of rows) {
    if (r.tests.startsWith("（")) continue;
    for (const name of r.tests.split("・")) assert.ok(existsSync(`tests/${name}.test.mts`), `${r.title}: tests/${name}.test.mts が無い`);
  }
});

test("台帳本体に「いま守る制約」の節を戻さない（決まりは主題ファイル）・地図は docs/file-map.md", () => {
  assert.ok(!ledger.includes("## いま守る制約（主題別）"));
  assert.ok(!ledger.includes("## ファイルの地図"));
  assert.ok(existsSync("docs/file-map.md"));
  const claude = readFileSync("CLAUDE.md", "utf8");
  assert.ok(claude.includes("触る主題のファイル") && claude.includes("docs/rules/"), "作業の作法が CLAUDE.md にある");
  // 原則5点は台帳本体の先頭（主題ファイルへ移さない）
  assert.ok(ledger.indexOf("## ⚠️ 不可侵の設計原則5点") < ledger.indexOf("## 現在地"));
});
