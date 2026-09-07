// 合言葉の入口（ACCESS_CODE を設定したときだけ middleware がここへ誘導する）
// 説明文は置かない。入力欄と1ボタンだけ。間違えたときだけ一言出す。

export default async function GatePage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <div className="gate">
      <div className="brand">メモおこし</div>
      <form className="gate-form" method="post" action="/api/gate">
        <input name="code" type="password" placeholder="合言葉" autoComplete="off" autoFocus required />
        <button type="submit" className="done-btn ready">
          入る
        </button>
      </form>
      {e && <div className="gate-err">合言葉が違います</div>}
    </div>
  );
}
