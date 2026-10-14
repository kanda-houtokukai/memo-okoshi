// テスト用の前読み（node --import）: ネットワークに出ようとしたら、その場で止める。
// 「本番の鍵しか無いときは1回も呼ばない」を、呼んだら落ちる形で確かめるために使う（tests/p23.test.mts）。
globalThis.fetch = async (url) => {
  console.error(`NETWORK_CALLED ${String(url).replace(/\?.*$/, "")}`);
  process.exit(97);
};
