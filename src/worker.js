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
// 2か所へ問い合わせるのは理由がある:
//   1. Supabaseへ直接 … 眠らせないための本命。ここは何があっても止めない
//   2. 同期版の取り次ぎ経由 … 購入者が実際に通る道。
//      学校のフィルタ対策で、ブラウザからの通信はすべて sync.yogolabo.com を
//      経由するようになった(2026-10-11)。この道が壊れると全員サインインできなく
//      なるため、毎日確かめる。1と分けているのは、2が壊れても1は動かすため。
//
// ping() は呼ばれた時刻を記録し、前回の時刻を返す。
// /keepalive を開くと、前回いつ動いたかが分かる(定時実行が生きているかの確認)。
//
// ここに書いてある接続先と鍵は、アプリの画面にも埋め込まれている公開情報。
// 実際のアクセス制御はSupabase側の行レベルセキュリティが担っており、
// この鍵だけでは誰のデータにも触れない。

const SUPABASE_URL = 'https://zilwexmufolpneakbomz.supabase.co'
const SYNC_PROXY_URL = 'https://sync.yogolabo.com/supabase'
const SUPABASE_ANON_KEY = 'sb_publishable_dNTQmo7sp4vhczKCvnmjXA_V3gXLdhm'

/** 指定した入口から Supabase のデータベースへ問い合わせる */
async function ping(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/rpc/ping`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    const body = (await res.text()).slice(0, 120)
    return { ok: res.ok, status: res.status, body }
  } catch (err) {
    return { ok: false, status: 0, body: String(err) }
  }
}

async function checkAll() {
  // 直接の方を先に。取り次ぎが壊れていても、眠らせない役目は果たす
  const direct = await ping(SUPABASE_URL)
  const viaProxy = await ping(SYNC_PROXY_URL)
  return {
    直接: direct,
    取り次ぎ経由: viaProxy,
    // 前回この仕組みが動いた時刻(定時実行が生きているかの目安)
    前回の実行: direct.ok ? direct.body : viaProxy.body,
  }
}

export default {
  // 定時実行(wrangler.jsonc の triggers.crons で設定)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      checkAll().then((r) => {
        // 記録だけ残す(Cloudflareのダッシュボード → Workers → ログ で確認できる)
        const ng = []
        if (!r.直接.ok) ng.push(`直接 ${r.直接.status} ${r.直接.body}`)
        if (!r.取り次ぎ経由.ok) ng.push(`取り次ぎ ${r.取り次ぎ経由.status} ${r.取り次ぎ経由.body}`)
        console.log(ng.length === 0 ? `[keepalive] ok 前回=${r.前回の実行}` : `[keepalive] 失敗 ${ng.join(' / ')}`)
      }),
    )
  },

  // 静的ファイルに当たらなかったときだけ呼ばれる。
  // /keepalive を開くと手動で動かせる(動いているかの確認用)。
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/keepalive') {
      const r = await checkAll()
      const ok = r.直接.ok && r.取り次ぎ経由.ok
      return new Response(JSON.stringify({ ok, ...r }, null, 2), {
        status: ok ? 200 : 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    }
    return new Response('Not Found', { status: 404 })
  },
}
