"use client";

// 項目カスタマイズのドロワー。文言・構造は正本（モックv6）どおり。

import { ITEM_LIBRARY, type ItemDef } from "@/lib/items";

type Props = {
  open: boolean;
  enabled: Record<string, boolean>;
  onToggle: (id: string) => void;
  onClose: () => void;
  /** 項目ライブラリ（P9: 会議は別のライブラリ）。省略時は面談 */
  lib?: ItemDef[];
};

export default function Drawer({ open, enabled, onToggle, onClose, lib = ITEM_LIBRARY }: Props) {
  // 群は使うライブラリに出てくるものだけ（会議は「基本」だけ）
  const groups = [...new Set(lib.map((l) => l.group))];
  return (
    <>
      <div className={"drawer-ovl" + (open ? " on" : "")} onClick={onClose} />
      <div className={"drawer" + (open ? " on" : "")}>
        <div className="dr-h">
          <h2>記録の項目</h2>
          <p>選択は次の変換からAIの拾い方に反映されます。</p>
        </div>
        <div className="dr-body">
          {groups.map((g) => (
            <div key={g}>
              <div className="dr-g">{g}</div>
              {lib.filter((l) => l.group === g).map((l) => (
                <div
                  key={l.id}
                  className={"dr-item" + (enabled[l.id] ? " on" : "")}
                  onClick={() => onToggle(l.id)}
                >
                  <span className="sw" />
                  <span className="tg" style={{ "--tabc": l.color } as React.CSSProperties} />
                  <span className="nm">{l.label}</span>
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
