// Stockroom plugin for Framer.
// 1. Connect a Framer project to a Stockroom store (one store ID).
// 2. Install the store kit (code file with overrides + components) and insert components.
// 3. Keep Products and Collections in Framer CMS in sync, so product pages can be designed as CMS templates.
import { framer, type ManagedCollection, type ManagedCollectionFieldInput, type CodeFileComponentExport } from "framer-plugin"
import { useEffect, useState } from "react"
import kitSource from "../../framer-kit/Stockroom.tsx?raw"
import "./App.css"

// Jordan's shared Stockroom project. A client with their own database can change these under "Advanced".
const DEFAULT_URL = "https://tziwxxsnhqetjcxgemen.supabase.co"
const DEFAULT_KEY = "sb_publishable_lsCNYNqr4tImLgLZNnUzzw_2iMtXyXZ"
const KIT_FILE = "Stockroom.tsx"

interface Connection { url: string; key: string; storeId: string; storeName: string; currency: string }
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const isCollectionMode = framer.mode === "configureManagedCollection" || framer.mode === "syncManagedCollection"
framer.showUI({ position: "top right", width: 340, height: isCollectionMode ? 360 : 560, resizable: "height" })

async function loadConnection(): Promise<Connection | null> {
    const raw = await framer.getPluginData("stockroom")
    try { return raw ? JSON.parse(raw) : null } catch { return null }
}
async function fetchJSON(c: Pick<Connection, "url" | "key">, path: string, body?: object) {
    const r = await fetch(`${c.url}/rest/v1/${path}`, { method: body ? "POST" : "GET", headers: { apikey: c.key, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
    const out = await r.json().catch(() => null)
    if (!r.ok) throw new Error(out?.message || `Request failed (${r.status})`)
    return out
}

// ------------------------------------------------------------------ CMS sync
const PRODUCT_FIELDS: ManagedCollectionFieldInput[] = [
    { id: "title", name: "Title", type: "string" },
    { id: "description", name: "Description", type: "formattedText" },
    { id: "image", name: "Image", type: "image" },
    { id: "image2", name: "Image 2", type: "image" },
    { id: "image3", name: "Image 3", type: "image" },
    { id: "price", name: "Price", type: "number" },
    { id: "compareAt", name: "Compare-at price", type: "number" },
    { id: "priceLabel", name: "Price label", type: "string" },
    { id: "onSale", name: "On sale", type: "boolean" },
    { id: "inStock", name: "In stock", type: "boolean" },
    { id: "category", name: "Category", type: "string" },
    { id: "collections", name: "Collections", type: "string" },
    { id: "vendor", name: "Vendor", type: "string" },
    { id: "tags", name: "Tags", type: "string" },
    { id: "productId", name: "Product ID", type: "string" },
]
const COLLECTION_FIELDS: ManagedCollectionFieldInput[] = [
    { id: "title", name: "Title", type: "string" },
    { id: "description", name: "Description", type: "formattedText" },
    { id: "productCount", name: "Products", type: "number" },
]
const SYMBOL: Record<string, string> = { GHS: "GH₵", NGN: "₦", USD: "$" }
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))

async function syncCollection(collection: ManagedCollection, c: Connection, kind: "products" | "collections") {
    const sid = c.storeId
    const [products, collections] = await Promise.all([
        fetchJSON(c, `products?store_id=eq.${sid}&status=eq.active&select=id,title,handle,description,images,category,vendor,tags,collection_ids,product_variants(price,compare_at,stock,track_stock,position)`),
        fetchJSON(c, `collections?store_id=eq.${sid}&visible=eq.true&select=id,title,handle,description&order=position`),
    ])
    const sym = SYMBOL[c.currency] ?? c.currency + " "
    const existing = new Set(await collection.getItemIds())
    if (kind === "products") {
        await collection.setFields(PRODUCT_FIELDS)
        const items = products.map((p: Row) => {
            const vs = [...p.product_variants].sort((a: Row, b: Row) => a.position - b.position)
            const prices = vs.map((v: Row) => Number(v.price))
            const lo = Math.min(...prices), hi = Math.max(...prices)
            const v0 = vs[0] ?? {}
            const compare = v0.compare_at != null ? Number(v0.compare_at) : 0
            return {
                id: p.id, slug: p.handle,
                fieldData: {
                    title: { type: "string", value: p.title },
                    description: { type: "formattedText", value: `<p>${esc(p.description || "")}</p>` },
                    image: { type: "image", value: p.images?.[0] ?? null },
                    image2: { type: "image", value: p.images?.[1] ?? null },
                    image3: { type: "image", value: p.images?.[2] ?? null },
                    price: { type: "number", value: lo },
                    compareAt: { type: "number", value: compare },
                    priceLabel: { type: "string", value: lo === hi ? `${sym}${lo}` : `From ${sym}${lo}` },
                    onSale: { type: "boolean", value: compare > lo },
                    inStock: { type: "boolean", value: vs.some((v: Row) => !v.track_stock || v.stock > 0) },
                    category: { type: "string", value: p.category ?? "" },
                    collections: { type: "string", value: collections.filter((x: Row) => p.collection_ids?.includes(x.id)).map((x: Row) => x.title).join(", ") },
                    vendor: { type: "string", value: p.vendor ?? "" },
                    tags: { type: "string", value: (p.tags ?? []).join(", ") },
                    productId: { type: "string", value: p.id },
                },
            }
        })
        await collection.addItems(items as never)
        await collection.removeItems([...existing].filter(id => !products.some((p: Row) => p.id === id)))
        await collection.setPluginData("kind", "products")
        return items.length
    }
    await collection.setFields(COLLECTION_FIELDS)
    const items = collections.map((x: Row) => ({
        id: x.id, slug: x.handle,
        fieldData: {
            title: { type: "string", value: x.title },
            description: { type: "formattedText", value: `<p>${esc(x.description || "")}</p>` },
            productCount: { type: "number", value: products.filter((p: Row) => p.collection_ids?.includes(x.id)).length },
        },
    }))
    await collection.addItems(items as never)
    await collection.removeItems([...existing].filter(id => !collections.some((x: Row) => x.id === id)))
    await collection.setPluginData("kind", "collections")
    return items.length
}

async function findOrCreate(kind: "products" | "collections") {
    for (const col of await framer.getManagedCollections()) if ((await col.getPluginData("kind")) === kind) return col
    return framer.createManagedCollection(kind === "products" ? "Products" : "Collections")
}

// ------------------------------------------------------------------ UI
export function App() {
    const [conn, setConn] = useState<Connection | null | undefined>(undefined)
    useEffect(() => { loadConnection().then(setConn) }, [])

    // Sync mode runs quietly and closes.
    useEffect(() => {
        if (framer.mode !== "syncManagedCollection" || conn === undefined) return
        ;(async () => {
            if (!conn) return
            const col = await framer.getActiveManagedCollection()
            const kind = ((await col.getPluginData("kind")) as "products" | "collections") || "products"
            const n = await syncCollection(col, conn, kind)
            framer.closePlugin(`Synced ${n} ${kind}`)
        })().catch(e => framer.closePlugin(`Sync failed: ${e.message}`, { variant: "error" }))
    }, [conn])

    if (conn === undefined || (framer.mode === "syncManagedCollection" && conn)) return <main className="center">Loading…</main>
    if (!conn) return <Connect onDone={setConn} />
    if (framer.mode === "configureManagedCollection") return <ConfigureCollection conn={conn} />
    return <Home conn={conn} onDisconnect={async () => { await framer.setPluginData("stockroom", null); setConn(null) }} />
}

function Connect({ onDone }: { onDone: (c: Connection) => void }) {
    const [storeId, setStoreId] = useState("")
    const [url, setUrl] = useState(DEFAULT_URL)
    const [key, setKey] = useState(DEFAULT_KEY)
    const [adv, setAdv] = useState(false)
    const [err, setErr] = useState("")
    const [busy, setBusy] = useState(false)
    const connect = async () => {
        setErr(""); setBusy(true)
        try {
            const id = storeId.trim()
            if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Paste the Store ID from the Stockroom dashboard (Settings → Website connection).")
            const store = await fetchJSON({ url, key }, "rpc/get_public_store", { sid: id })
            if (!store) throw new Error("No store found with that ID.")
            const c: Connection = { url, key, storeId: id, storeName: store.name, currency: store.currency }
            await framer.setPluginData("stockroom", JSON.stringify(c))
            onDone(c)
        } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
    }
    return (
        <main>
            <h2>Connect your store</h2>
            <p className="muted">Paste the Store ID from the Stockroom dashboard: Settings → Website connection.</p>
            <input value={storeId} onChange={e => setStoreId(e.target.value)} placeholder="Store ID" autoFocus />
            <button className="link" onClick={() => setAdv(a => !a)}>{adv ? "Hide" : "Show"} advanced</button>
            {adv && <>
                <label>Database URL<input value={url} onChange={e => setUrl(e.target.value.trim())} /></label>
                <label>Public key<input value={key} onChange={e => setKey(e.target.value.trim())} /></label>
                <p className="muted small">Only change these for a client on their own database.</p>
            </>}
            {err && <p className="error">{err}</p>}
            <button className="framer-button-primary" disabled={busy || !storeId.trim()} onClick={connect}>{busy ? "Connecting…" : "Connect"}</button>
        </main>
    )
}

function ConfigureCollection({ conn }: { conn: Connection }) {
    const [busy, setBusy] = useState(false)
    const run = async (kind: "products" | "collections") => {
        setBusy(true)
        try { const col = await framer.getActiveManagedCollection(); const n = await syncCollection(col, conn, kind); framer.closePlugin(`Synced ${n} ${kind} from ${conn.storeName}`) }
        catch (e) { framer.notify(`Sync failed: ${(e as Error).message}`, { variant: "error" }); setBusy(false) }
    }
    return (
        <main>
            <h2>{conn.storeName}</h2>
            <p className="muted">What should this CMS collection hold?</p>
            <button className="framer-button-primary" disabled={busy} onClick={() => run("products")}>Products</button>
            <button disabled={busy} onClick={() => run("collections")}>Collections / categories</button>
        </main>
    )
}

const OVERRIDES: [string, string][] = [
    ["withAddToCart", "Adds this product to the cart"], ["withBuyNow", "Adds and opens checkout"], ["withPrice", "Text: live price"], ["withComparePrice", "Text: was-price (hidden if not on sale)"],
    ["withStockStatus", "Text: In stock / Only 3 left / Sold out"], ["withVariantOption", "A size/colour pill (name the layer “M”, “Black”…)"], ["withQuantity", "Text: chosen quantity"], ["withQuantityPlus", "+ button"], ["withQuantityMinus", "− button"],
    ["withCartCount", "Text: items in cart"], ["withHideWhenCartEmpty", "Hide (e.g. badge) when cart is empty"], ["withOpenCart", "Opens the cart"], ["withCheckout", "Opens checkout"],
    ["withShowWhenSoldOut", "Show only when sold out"], ["withHideWhenSoldOut", "Hide when sold out"], ["withOrderOnWhatsApp", "Opens WhatsApp chat"], ["withBookTable", "Opens table booking (restaurants)"],
]

function Home({ conn, onDisconnect }: { conn: Connection; onDisconnect: () => void }) {
    const [exports, setExports] = useState<CodeFileComponentExport[]>([])
    const [status, setStatus] = useState("")
    const [busy, setBusy] = useState(false)
    const kit = kitSource.replace("__SUPABASE_URL__", conn.url).replace("__SUPABASE_KEY__", conn.key).replace("__STORE_ID__", conn.storeId)

    const findKit = async () => (await framer.getCodeFiles()).find(f => f.name === KIT_FILE || f.path.endsWith(KIT_FILE))
    const refreshExports = async () => { const f = await findKit(); setExports((f?.exports ?? []).filter((e): e is CodeFileComponentExport => e.type === "component")) }
    useEffect(() => { refreshExports() }, [])

    const install = async () => {
        setBusy(true); setStatus("")
        try {
            const f = await findKit()
            if (f) await f.setFileContent(kit); else await framer.createCodeFile(KIT_FILE, kit)
            await new Promise(r => setTimeout(r, 1200)) // let Framer compile the file
            await refreshExports()
            setStatus(f ? "Store kit updated." : "Store kit installed. Overrides are now available on every layer.")
        } catch (e) { setStatus(`Couldn’t install: ${(e as Error).message}`) } finally { setBusy(false) }
    }
    const insert = async (e: CodeFileComponentExport) => {
        try { await framer.addComponentInstance({ url: e.insertURL }); framer.notify(`${e.name} added to the canvas`) } catch (x) { framer.notify((x as Error).message, { variant: "error" }) }
    }
    const syncAll = async () => {
        setBusy(true); setStatus("Syncing…")
        try {
            const p = await syncCollection(await findOrCreate("products"), conn, "products")
            const c = await syncCollection(await findOrCreate("collections"), conn, "collections")
            setStatus(`Synced ${p} products and ${c} collections to the CMS. Create a CMS page for Products at /products to design product pages.`)
        } catch (e) { setStatus(`Sync failed: ${(e as Error).message}`) } finally { setBusy(false) }
    }

    return (
        <main>
            <div className="row"><div><h2>{conn.storeName}</h2><span className="muted small">Connected</span></div><button className="link" onClick={onDisconnect}>Disconnect</button></div>

            <section>
                <h3>1. Store kit</h3>
                <p className="muted small">Adds the cart, checkout and store buttons to this project. Run again to update.</p>
                <button className="framer-button-primary" disabled={busy} onClick={install}>{exports.length ? "Update store kit" : "Install store kit"}</button>
            </section>

            <section>
                <h3>2. Products in the CMS</h3>
                <p className="muted small">Creates “Products” and “Collections” CMS collections that stay in sync with the dashboard.</p>
                <button disabled={busy} onClick={syncAll}>Sync products to CMS</button>
            </section>

            {status && <p className="status small">{status}</p>}

            {exports.length > 0 && (
                <section>
                    <h3>3. Add components</h3>
                    <p className="muted small">Add “Cart Drawer” once (in your nav). Put your own design in “Add To Cart”’s Design slot.</p>
                    <div className="grid">{exports.map(e => <button key={e.insertURL} onClick={() => insert(e)}>{e.name.replace(/([a-z])([A-Z])/g, "$1 $2")}</button>)}</div>
                </section>
            )}

            <section>
                <h3>4. Make any layer a store button</h3>
                <p className="muted small">Select a layer → Code Overrides → File: Stockroom → pick one:</p>
                <ul className="overrides">{OVERRIDES.map(([n, d]) => <li key={n}><code>{n}</code><span>{d}</span></li>)}</ul>
            </section>
        </main>
    )
}
