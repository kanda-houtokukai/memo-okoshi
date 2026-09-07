"use client";

// 項目カスタマイズのドロワー。文言・構造は正本（モックv6）どおり。

import { ITEM_LIBRARY } from "@/lib/items";

type Props = {
  open: boolean;
  enabled: Record<string, boolean>;
  onToggle: (id: string) => void;
  onClose: () => void;
};

export default function Drawer({ open, enabled, onToggle, onClose }: Props) {
  return (
    <>
      <div className={"drawer-ovl" + (open ? " on" : "")} onClick={onClose} />
      <div className={"drawer" + (open ? " on" : "")}>
        <div className="dr-h">
          <h2>記録の項目</h2>
          <p>選択は次の変換からAIの拾い方に反映されます。</p>
        </div>
        <div className="dr-body">
          {(["基本", "追加項目"] as const).map((g) => (
            <div key={g}>
              <div className="dr-g">{g}</div>
              {ITEM_LIBRARY.filter((l) => l.group === g).map((l) => (
                <div
                  key={l.id}
                  className={"dr-item" + (enabled[l.id] ? " on" : "")}
                  onClick={() => onToggle(l.id)}
                >
                  <span className="sw" />
                  <span className="nm">{l.label}</span>
                  <span className="tg" style={{ "--tabc": l.color } as React.CSSProperties} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="dr-f">設定はこの端末内のみ・個人情報を含みません</div>
      </div>
    </>
  );
}
