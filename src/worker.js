// info.yogolabo.com を配信するワーカー。
//
// ページそのものは Cloudflare の静的配信(assets)が返すため、ここでは扱わない。
// このファイルの役目は、1日1回 Supabase へ問い合わせて眠らせないこと。
//
// なぜ必要か:
//   Supabaseの無料プランは7日間アクセスがないとプロジェクトを自動で一時停止する。
//   同期版は1年間の利用権として販売しているので、止まると購入者がサインインも
//   同期もできなくなる(2026-10-08に実際に発生した)。
//   1日1回データベースへ問い合わせを出して、停止の条件に入らないようにする。
//
// ここに書いてある接続先と鍵は、アプリの画面にも埋め込まれている公開情報。
// 実際のアクセス制御はSupabase側の行レベルセキュリティが担っており、
// この鍵だけでは誰のデータにも触れない。

const SUPABASE_URL = 'https://zilwexmufolpneakbomz.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_dNTQmo7sp4vhczKCvnmjXA_V3gXLdhm'

/** Supabaseのデータベースへ問い合わせる。固定の文字列が返るだけの関数を呼ぶ。 */
async function pingSupabase() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ping`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  const body = await res.text()
  return { ok: res.ok, status: res.status, body: body.slice(0, 200) }
}

export default {
  // 定時実行(wrangler.jsonc の triggers.crons で設定)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      pingSupabase()
        .then((r) => {
          // 失敗してもここでは何もできない。記録だけ残す
          // (Cloudflareのダッシュボード → Workers → ログ で確認できる)
          console.log(r.ok ? `[keepalive] ok ${r.status}` : `[keepalive] 失敗 ${r.status} ${r.body}`)
        })
        .catch((err) => {
          console.log(`[keepalive] 失敗 ${String(err)}`)
        }),
    )
  },

  // 静的ファイルに当たらなかったときだけ呼ばれる。
  // /keepalive を開くと手動で動かせる(動いているかの確認用)。
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/keepalive') {
      const r = await pingSupabase()
      return new Response(JSON.stringify(r, null, 2), {
        status: r.ok ? 200 : 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    }
    return new Response('Not Found', { status: 404 })
  },
}
