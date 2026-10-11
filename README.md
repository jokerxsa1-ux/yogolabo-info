# yogolabo-info

販売前に見せるページだけを置く静的サイト(info.yogolabo.com)。

- `public/index.html` 入口
- `public/terms.html` 利用規約
- `public/privacy.html` プライバシーポリシー
- `public/check.html` 学校のパソコンで使えるかの確認

利用規約とプライバシーポリシーは、販売資料リポジトリの `tools/build_public.js` が
下書きから生成して、ここへ書き出す。直接編集しない。

アプリ本体のURLは、このサイトのどこにも書かない(購入後の案内にだけ書く)。

## Supabaseを眠らせないための定時処理

Supabaseの無料プランは**7日間アクセスがないとプロジェクトを自動で一時停止**する。
同期版は1年間の利用権として販売しているため、止まると購入者が使えなくなる
(2026-10-08に実際に発生した)。

`src/worker.js` が毎日 03:00 UTC(日本時間の正午)に Supabase の `public.ping()` を呼び、
データベースへの問い合わせを発生させ続ける。設定は `wrangler.jsonc` の `triggers.crons`。

問い合わせ先は2つ。

1. **Supabaseへ直接** — 眠らせないための本命。何があっても止めない
2. **同期版の取り次ぎ経由**(`sync.yogolabo.com/supabase/...`) — 購入者が実際に通る道。
   学校のフィルタ対策でブラウザからの通信をすべてここに通すようにしたため(2026-10-11)、
   この道が壊れると全員サインインできなくなる。毎日確かめる

1と分けているのは、2が壊れても1は動かすため。

- 動いているかの確認: https://info.yogolabo.com/keepalive を開く。`"ok": true` が返れば正常
  - `前回の実行` の時刻が前日のものなら、定時実行が動いている
  - 何日も前の時刻のままなら、定時実行が止まっている
- 実行の記録: Cloudflare ダッシュボード → Workers → yogolabo-info → ログ
- `public.ping()` は呼ばれた時刻を記録し、前回の時刻を返すだけ。利用者のデータには触れない
  (定義は同期版リポジトリの `supabase/schema.sql` 末尾)
