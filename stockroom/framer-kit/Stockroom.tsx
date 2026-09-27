// Stockroom store kit for Framer.
// Installed by the Stockroom plugin. It connects this website to the store's live products, cart and checkout.
//
// HOW TO USE
// • Any layer can become a store button: select it → right panel → Code Overrides → File "Stockroom" → pick an override
//   (withAddToCart, withBuyNow, withPrice, withCartCount, withOpenCart, withCheckout …).
//   On a product page (/products/<slug>) the overrides know which product they belong to from the page address.
// • Inside a CMS list (product cards), drop in the "Add To Cart" component and connect its Product field to the CMS Slug.
//   Put your own designed button into its "Design" slot, so it looks exactly how you want.
// • Add the "Cart Drawer" component once per page (or in a shared nav component). It includes the checkout.
// • Add "Order Confirmation" to the page customers return to after paying.
import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

// ----------------------------------------------------------------------------- connection (set by the plugin)
const STORE = {
    url: "__SUPABASE_URL__",
    key: "__SUPABASE_KEY__",
    storeId: "__STORE_ID__",
}

// ----------------------------------------------------------------------------- types
type Variant = { id: string; title: string; options: string[]; price: number; compare_at: number | null; stock: number; track_stock: boolean; position: number }
type ModGroup = { name: string; required: boolean; max: number; choices: { name: string; price: number }[] }
type Product = { id: string; title: string; handle: string; description: string; images: string[]; hue: number; collection_ids: string[]; options: { name: string; values: string[] }[]; modifiers: ModGroup[]; product_variants: Variant[] }
type Collection = { id: string; title: string; handle: string }
type Zone = { id: string; name: string; fee: number; eta: string }
type Catalog = { products: Product[]; collections: Collection[]; zones: Zone[]; payments: string[]; store: any }
type Line = { key: string; productId: string; variantId: string; title: string; variantTitle: string; price: number; qty: number; image?: string; modifiers: { name: string; price: number }[] }
type State = { lines: Line[]; open: boolean; view: "cart" | "checkout" | "done"; selected: Record<string, string>; qty: Record<string, number>; picking: string | null; booking: boolean; lastOrder: any }

const isBrowser = typeof window !== "undefined"
const configured = !STORE.storeId.startsWith("__")

// ----------------------------------------------------------------------------- tiny shared store
const LS = "stockroom-cart-" + STORE.storeId
let state: State = { lines: [], open: false, view: "cart", selected: {}, qty: {}, picking: null, booking: false, lastOrder: null }
if (isBrowser) { try { const s = JSON.parse(localStorage.getItem(LS) || "null"); if (s?.lines) state.lines = s.lines } catch {} }
const listeners = new Set<() => void>()
function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) }
    if (isBrowser) { try { localStorage.setItem(LS, JSON.stringify({ lines: state.lines })) } catch {} }
    listeners.forEach((l) => l())
}
function useStore(): State {
    return React.useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state, () => state)
}

// ----------------------------------------------------------------------------- data
const headers = () => ({ apikey: STORE.key, "Content-Type": "application/json" })
async function rest(path: string) {
    const r = await fetch(`${STORE.url}/rest/v1/${path}`, { headers: headers() })
    if (!r.ok) throw new Error(await r.text())
    return r.json()
}
async function rpc(name: string, args: object) {
    const r = await fetch(`${STORE.url}/rest/v1/rpc/${name}`, { method: "POST", headers: headers(), body: JSON.stringify(args) })
    const body = await r.json().catch(() => null)
    if (!r.ok) throw new Error(body?.message || "Something went wrong")
    return body
}
async function api(route: string, body?: object) {
    const r = await fetch(`${STORE.url}/functions/v1/store-api/${route}`, { method: body ? "POST" : "GET", headers: headers(), body: body ? JSON.stringify(body) : undefined })
    const out = await r.json().catch(() => ({ error: "Something went wrong" }))
    if (out.error) throw new Error(out.error)
    return out
}

let catalogPromise: Promise<Catalog> | null = null
function loadCatalog(): Promise<Catalog> {
    if (!configured) return Promise.resolve({ products: [], collections: [], zones: [], payments: [], store: { currency: "GHS" } })
    if (!catalogPromise) {
        const sid = STORE.storeId
        catalogPromise = Promise.all([
            rest(`products?store_id=eq.${sid}&status=eq.active&select=id,title,handle,description,images,hue,collection_ids,options,modifiers,product_variants(id,title,options,price,compare_at,stock,track_stock,position)`),
            rest(`collections?store_id=eq.${sid}&visible=eq.true&select=id,title,handle&order=position`),
            rest(`delivery_zones?store_id=eq.${sid}&active=eq.true&select=id,name,fee,eta&order=position`),
            rest(`payment_settings?store_id=eq.${sid}&enabled=eq.true&select=provider`),
            rpc("get_public_store", { sid }),
        ]).then(([products, collections, zones, pay, store]) => ({
            products: products.map((p: Product) => ({ ...p, product_variants: [...p.product_variants].sort((a, b) => a.position - b.position).map((v) => ({ ...v, price: Number(v.price), compare_at: v.compare_at == null ? null : Number(v.compare_at) })) })),
            collections, zones: zones.map((z: Zone) => ({ ...z, fee: Number(z.fee) })), payments: pay.map((p: { provider: string }) => p.provider), store,
        })).catch((e) => { catalogPromise = null; throw e })
    }
    return catalogPromise
}
function useCatalog() {
    const [c, setC] = React.useState<Catalog | null>(null)
    const [err, setErr] = React.useState("")
    React.useEffect(() => { let on = true; loadCatalog().then((x) => on && setC(x)).catch((e) => on && setErr(String(e.message || e))); return () => { on = false } }, [])
    return { catalog: c, error: err }
}

const SYMBOL: Record<string, string> = { GHS: "GH₵", NGN: "₦", USD: "$" }
function fmt(n: number, currency = "GHS") { return (SYMBOL[currency] ?? currency + " ") + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) }

/** Which product this layer belongs to: an explicit slug, or the page address (/products/<slug>). */
function handleFromUrl() {
    if (!isBrowser) return ""
    const parts = window.location.pathname.split("/").filter(Boolean)
    return decodeURIComponent(parts[parts.length - 1] || "")
}
function useProduct(handle?: string) {
    const { catalog } = useCatalog()
    const h = (handle || handleFromUrl()).toLowerCase()
    const product = catalog?.products.find((p) => p.handle === h || p.id === h) ?? null
    const s = useStore()
    const variant = product ? product.product_variants.find((v) => v.id === s.selected[product.id]) ?? product.product_variants[0] : null
    return { product, variant, catalog, currency: catalog?.store?.currency ?? "GHS" }
}
const inStock = (v: Variant | null) => !!v && (!v.track_stock || v.stock > 0)

// ----------------------------------------------------------------------------- cart actions
function addToCart(p: Product, v: Variant, qty = 1, mods: { name: string; price: number }[] = []) {
    if (!inStock(v)) return
    const key = v.id + "|" + mods.map((m) => m.name).join(",")
    setState((s) => {
        const have = s.lines.find((l) => l.key === key)
        const max = v.track_stock ? v.stock : 999
        const lines = have
            ? s.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(max, l.qty + qty) } : l))
            : [...s.lines, { key, productId: p.id, variantId: v.id, title: p.title, variantTitle: v.title, price: v.price + mods.reduce((a, m) => a + m.price, 0), qty: Math.min(max, qty), image: p.images[0], modifiers: mods }]
        return { lines, open: true, view: "cart", picking: null }
    })
}
/** Adds the product, asking for add-ons first if it has required choices. */
function tapAdd(p: Product, v: Variant, qty = 1) {
    if (p.modifiers?.length) setState({ picking: p.id, qty: { ...state.qty, [p.id]: qty } })
    else addToCart(p, v, qty)
}
const cartCount = (s: State) => s.lines.reduce((a, l) => a + l.qty, 0)
const cartTotal = (s: State) => s.lines.reduce((a, l) => a + l.price * l.qty, 0)

// ----------------------------------------------------------------------------- OVERRIDES (use on any layer)
type HOC = (C: React.ComponentType<any>) => React.ComponentType<any>
const click = (fn: (props: any) => void): HOC => (C) => (props: any) => <C {...props} onClick={(e: any) => { e?.preventDefault?.(); fn(props) }} style={{ ...props.style, cursor: "pointer" }} />

/** Adds this page's product (with the chosen variant and quantity) to the cart. */
export const withAddToCart: HOC = (C) => (props: any) => {
    const { product, variant } = useProduct()
    const s = useStore()
    const out = product && !inStock(variant)
    return <C {...props} onClick={(e: any) => { e?.preventDefault?.(); if (product && variant) tapAdd(product, variant, s.qty[product.id] || 1) }} style={{ ...props.style, cursor: out ? "not-allowed" : "pointer", opacity: out ? 0.5 : props.style?.opacity }} />
}
/** Adds to cart and goes straight to checkout. */
export const withBuyNow: HOC = (C) => (props: any) => {
    const { product, variant } = useProduct()
    const s = useStore()
    return <C {...props} onClick={(e: any) => { e?.preventDefault?.(); if (product && variant && inStock(variant)) { if (product.modifiers?.length) tapAdd(product, variant, s.qty[product.id] || 1); else { addToCart(product, variant, s.qty[product.id] || 1); setState({ view: "checkout" }) } } }} style={{ ...props.style, cursor: "pointer" }} />
}
/** Text layer: shows the live price of the selected variant. */
export const withPrice: HOC = (C) => (props: any) => {
    const { variant, currency } = useProduct()
    return <C {...props} text={variant ? fmt(variant.price, currency) : props.text} />
}
/** Text layer: shows the crossed-out "was" price. Hidden when the product isn't on sale. */
export const withComparePrice: HOC = (C) => (props: any) => {
    const { variant, currency } = useProduct()
    if (variant && !(variant.compare_at && variant.compare_at > variant.price)) return null
    return <C {...props} text={variant ? fmt(variant.compare_at!, currency) : props.text} style={{ ...props.style, textDecoration: "line-through" }} />
}
/** Text layer: "In stock", "Only 3 left" or "Sold out". */
export const withStockStatus: HOC = (C) => (props: any) => {
    const { variant } = useProduct()
    const text = !variant ? props.text : !inStock(variant) ? "Sold out" : variant.track_stock && variant.stock <= 5 ? `Only ${variant.stock} left` : "In stock"
    return <C {...props} text={text} />
}
/** Hides the layer when the product is sold out (e.g. the Add to cart button). */
export const withHideWhenSoldOut: HOC = (C) => (props: any) => { const { variant } = useProduct(); return variant && !inStock(variant) ? null : <C {...props} /> }
/** Shows the layer only when the product is sold out (e.g. a "Sold out" badge). */
export const withShowWhenSoldOut: HOC = (C) => (props: any) => { const { variant } = useProduct(); return variant && !inStock(variant) ? <C {...props} /> : null }
/** Text layers for the product's name and description. */
export const withProductTitle: HOC = (C) => (props: any) => { const { product } = useProduct(); return <C {...props} text={product?.title ?? props.text} /> }
export const withProductDescription: HOC = (C) => (props: any) => { const { product } = useProduct(); return <C {...props} text={product?.description ?? props.text} /> }
/** Quantity picker: a text layer that shows the number, plus + and − buttons. */
export const withQuantity: HOC = (C) => (props: any) => { const { product } = useProduct(); const s = useStore(); return <C {...props} text={String(product ? s.qty[product.id] || 1 : 1)} /> }
export const withQuantityPlus: HOC = (C) => (props: any) => {
    const { product, variant } = useProduct()
    return <C {...props} onClick={() => product && setState((s) => ({ qty: { ...s.qty, [product.id]: Math.min(variant?.track_stock ? variant.stock : 99, (s.qty[product.id] || 1) + 1) } }))} style={{ ...props.style, cursor: "pointer" }} />
}
export const withQuantityMinus: HOC = (C) => (props: any) => {
    const { product } = useProduct()
    return <C {...props} onClick={() => product && setState((s) => ({ qty: { ...s.qty, [product.id]: Math.max(1, (s.qty[product.id] || 1) - 1) } }))} style={{ ...props.style, cursor: "pointer" }} />
}
/** Text layer: number of items in the cart. */
export const withCartCount: HOC = (C) => (props: any) => { const s = useStore(); return <C {...props} text={String(cartCount(s))} /> }
/** Text layer: cart total. */
export const withCartTotal: HOC = (C) => (props: any) => { const s = useStore(); const { currency } = useProduct(); return <C {...props} text={fmt(cartTotal(s), currency)} /> }
/** Hides the layer while the cart is empty (e.g. a cart count bubble). */
export const withHideWhenCartEmpty: HOC = (C) => (props: any) => { const s = useStore(); return cartCount(s) ? <C {...props} /> : null }
export const withOpenCart = click(() => setState({ open: true, view: "cart" }))
export const withCloseCart = click(() => setState({ open: false }))
export const withCheckout = click(() => setState({ open: true, view: state.lines.length ? "checkout" : "cart" }))
/** Opens the table booking form (restaurants). */
export const withBookTable = click(() => setState({ booking: true }))
/** Opens WhatsApp with the store's number and this page's product. */
export const withOrderOnWhatsApp: HOC = (C) => (props: any) => {
    const { product, catalog } = useProduct()
    const phone = String(catalog?.store?.storefront?.whatsapp || catalog?.store?.phone || "").replace(/\D/g, "")
    const text = product ? `Hi, I'd like to order ${product.title}` : "Hi, I'd like to order"
    return <C {...props} onClick={() => phone && window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank")} style={{ ...props.style, cursor: "pointer" }} />
}
/** A variant choice (e.g. a "M" size pill). Name the layer after the option value, like "M" or "Black". */
export const withVariantOption: HOC = (C) => (props: any) => {
    const { product, variant } = useProduct()
    const value = String(props.name || props.text || "").trim()
    if (!product) return <C {...props} />
    const idx = product.options.findIndex((o) => o.values.includes(value))
    const active = idx >= 0 && variant?.options[idx] === value
    const choose = () => {
        if (idx < 0 || !variant) return
        const wanted = [...variant.options]; wanted[idx] = value
        const v = product.product_variants.find((x) => x.options.every((o, i) => o === wanted[i])) ?? product.product_variants.find((x) => x.options[idx] === value)
        if (v) setState((s) => ({ selected: { ...s.selected, [product.id]: v.id } }))
    }
    return <C {...props} onClick={choose} variant={active ? "Selected" : props.variant} style={{ ...props.style, cursor: "pointer", outline: active ? "2px solid currentColor" : undefined, outlineOffset: active ? 2 : undefined }} />
}

// ----------------------------------------------------------------------------- shared styles for built-in UI
type Look = { accent: string; text: string; bg: string; radius: number; font: any }
const lookControls = {
    accent: { type: ControlType.Color, title: "Button", defaultValue: "#111111" },
    text: { type: ControlType.Color, title: "Text", defaultValue: "#111111" },
    bg: { type: ControlType.Color, title: "Background", defaultValue: "#FFFFFF" },
    radius: { type: ControlType.Number, title: "Radius", defaultValue: 10, min: 0, max: 40 },
    font: { type: ControlType.Font, title: "Font", controls: "extended", defaultFontType: "sans-serif", defaultValue: { fontSize: 15 } },
} as const
const btn = (l: Look, ghost = false): React.CSSProperties => ({ ...l.font, width: "100%", minHeight: 46, border: ghost ? `1px solid ${l.text}33` : 0, borderRadius: l.radius, background: ghost ? "transparent" : l.accent, color: ghost ? l.text : "#fff", fontWeight: 600, cursor: "pointer", padding: "10px 16px" })
const input = (l: Look): React.CSSProperties => ({ ...l.font, width: "100%", minHeight: 44, border: `1px solid ${l.text}26`, borderRadius: Math.min(l.radius, 12), padding: "8px 12px", background: "#fff", color: "#111", boxSizing: "border-box", fontSize: 15 })

// ----------------------------------------------------------------------------- COMPONENTS
/**
 * Add To Cart
 * Put your own designed button in the "Design" slot. In a CMS list, connect "Product" to the Slug field.
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 */
export function AddToCart(props: { product: string; design?: React.ReactNode; label: string; soldOutLabel: string; buyNow: boolean } & Look) {
    const { product, variant } = useProduct(props.product)
    const s = useStore()
    const out = !!product && !inStock(variant)
    const go = () => {
        if (!product || !variant || out) return
        const q = s.qty[product.id] || 1
        if (product.modifiers?.length) return tapAdd(product, variant, q)
        addToCart(product, variant, q)
        if (props.buyNow) setState({ view: "checkout" })
    }
    const slot = React.Children.toArray(props.design)[0]
    if (slot) return <div onClick={go} style={{ cursor: out ? "not-allowed" : "pointer", opacity: out ? 0.5 : 1, width: "100%", height: "100%" }}>{slot}</div>
    return <button onClick={go} disabled={out} style={{ ...btn(props), opacity: out ? 0.5 : 1 }}>{out ? props.soldOutLabel : props.label}</button>
}
addPropertyControls(AddToCart, {
    product: { type: ControlType.String, title: "Product", placeholder: "Slug (connect to CMS Slug)", description: "Leave empty on a product page to use the page’s product." },
    design: { type: ControlType.ComponentInstance, title: "Design" },
    label: { type: ControlType.String, title: "Label", defaultValue: "Add to cart" },
    soldOutLabel: { type: ControlType.String, title: "Sold out", defaultValue: "Sold out" },
    buyNow: { type: ControlType.Boolean, title: "Go to checkout", defaultValue: false },
    ...lookControls,
})

/**
 * Price
 * @framerSupportedLayoutWidth auto
 * @framerSupportedLayoutHeight auto
 */
export function Price(props: { product: string; showCompare: boolean; font: any; color: string; compareColor: string }) {
    const { variant, currency } = useProduct(props.product)
    if (!variant) return <span style={{ ...props.font, color: props.color }}>—</span>
    return (
        <span style={{ ...props.font, color: props.color, display: "inline-flex", gap: 8, alignItems: "baseline", whiteSpace: "nowrap" }}>
            {fmt(variant.price, currency)}
            {props.showCompare && variant.compare_at && variant.compare_at > variant.price ? <s style={{ color: props.compareColor, fontSize: "0.85em" }}>{fmt(variant.compare_at, currency)}</s> : null}
        </span>
    )
}
addPropertyControls(Price, {
    product: { type: ControlType.String, title: "Product", placeholder: "Slug (connect to CMS Slug)" },
    showCompare: { type: ControlType.Boolean, title: "Sale price", defaultValue: true },
    font: { type: ControlType.Font, controls: "extended", defaultFontType: "sans-serif", defaultValue: { fontSize: 16 } },
    color: { type: ControlType.Color, defaultValue: "#111111" },
    compareColor: { type: ControlType.Color, title: "Was price", defaultValue: "#999999" },
})

/**
 * Variant Picker: size, colour or volume buttons for the product.
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
export function VariantPicker(props: { product: string; showQuantity: boolean } & Look) {
    const { product, variant } = useProduct(props.product)
    const s = useStore()
    if (!product || !variant || !product.options.length) return props.showQuantity && product ? <Qty product={product} look={props} qty={s.qty[product.id] || 1} max={variant?.track_stock ? variant.stock : 99} /> : null
    const pick = (i: number, value: string) => {
        const wanted = [...variant.options]; wanted[i] = value
        const v = product.product_variants.find((x) => x.options.every((o, k) => o === wanted[k])) ?? product.product_variants.find((x) => x.options[i] === value)
        if (v) setState((st) => ({ selected: { ...st.selected, [product.id]: v.id } }))
    }
    return (
        <div style={{ display: "grid", gap: 14, color: props.text, ...props.font }}>
            {product.options.map((o, i) => (
                <div key={o.name} style={{ display: "grid", gap: 8 }}>
                    <span style={{ fontSize: "0.85em", opacity: 0.7 }}>{o.name}: <b>{variant.options[i]}</b></span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {o.values.map((val) => {
                            const on = variant.options[i] === val
                            const avail = product.product_variants.some((x) => x.options[i] === val && inStock(x))
                            return <button key={val} onClick={() => pick(i, val)} style={{ ...props.font, minWidth: 44, height: 40, padding: "0 14px", borderRadius: props.radius, border: `1.5px solid ${on ? props.accent : props.text + "33"}`, background: on ? props.accent : props.bg, color: on ? "#fff" : props.text, cursor: "pointer", textDecoration: avail ? "none" : "line-through", opacity: avail ? 1 : 0.5 }}>{val}</button>
                        })}
                    </div>
                </div>
            ))}
            {props.showQuantity && <Qty product={product} look={props} qty={s.qty[product.id] || 1} max={variant.track_stock ? variant.stock : 99} />}
        </div>
    )
}
function Qty({ product, look, qty, max }: { product: Product; look: Look; qty: number; max: number }) {
    const set = (n: number) => setState((s) => ({ qty: { ...s.qty, [product.id]: Math.max(1, Math.min(max, n)) } }))
    const b: React.CSSProperties = { width: 40, height: 40, border: 0, background: "transparent", color: look.text, fontSize: 18, cursor: "pointer" }
    return <div style={{ display: "inline-flex", alignItems: "center", border: `1px solid ${look.text}33`, borderRadius: look.radius, width: "fit-content" }}><button style={b} onClick={() => set(qty - 1)} aria-label="Less">−</button><span style={{ minWidth: 28, textAlign: "center" }}>{qty}</span><button style={b} onClick={() => set(qty + 1)} aria-label="More">+</button></div>
}
addPropertyControls(VariantPicker, {
    product: { type: ControlType.String, title: "Product", placeholder: "Slug (optional)" },
    showQuantity: { type: ControlType.Boolean, title: "Quantity", defaultValue: true },
    ...lookControls,
})

/**
 * Cart Drawer: the cart and checkout. Add it once to each page (or to your navigation component).
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 */
export function CartDrawer(props: { title: string; width: number; showDiscount: boolean; returnPath: string } & Look) {
    const s = useStore()
    const { catalog } = useCatalog()
    const cur = catalog?.store?.currency ?? "GHS"
    const picking = catalog?.products.find((p) => p.id === s.picking)
    React.useEffect(() => {
        if (!isBrowser) return
        const k = (e: KeyboardEvent) => e.key === "Escape" && setState({ open: false, picking: null })
        window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k)
    }, [])
    if (picking) return <Options product={picking} look={props} currency={cur} />
    if (!s.open) return null
    const shell: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 9999, display: "flex", justifyContent: "flex-end", background: "rgba(0,0,0,.35)" }
    const panel: React.CSSProperties = { width: `min(${props.width}px, 100vw)`, height: "100%", background: props.bg, color: props.text, display: "flex", flexDirection: "column", ...props.font, boxShadow: "0 0 40px rgba(0,0,0,.2)" }
    return (
        <div style={shell} onMouseDown={(e) => e.target === e.currentTarget && setState({ open: false })}>
            <aside style={panel} role="dialog" aria-label="Cart">
                <header style={{ display: "flex", alignItems: "center", padding: "18px 20px", borderBottom: `1px solid ${props.text}14` }}>
                    {s.view === "checkout" && <button onClick={() => setState({ view: "cart" })} style={{ border: 0, background: "none", color: props.text, cursor: "pointer", marginRight: 8, fontSize: 18 }} aria-label="Back">←</button>}
                    <b style={{ flex: 1, fontSize: 18 }}>{s.view === "checkout" ? "Checkout" : s.view === "done" ? "Thank you" : `${props.title} (${cartCount(s)})`}</b>
                    <button onClick={() => setState({ open: false })} style={{ border: 0, background: "none", color: props.text, cursor: "pointer", fontSize: 22 }} aria-label="Close">×</button>
                </header>
                <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
                    {s.view === "cart" && <CartLines look={props} currency={cur} />}
                    {s.view === "checkout" && catalog && <Checkout look={props} catalog={catalog} showDiscount={props.showDiscount} returnPath={props.returnPath} />}
                    {s.view === "done" && s.lastOrder && <Done look={props} currency={cur} order={s.lastOrder} />}
                </div>
                {s.view === "cart" && s.lines.length > 0 && (
                    <footer style={{ padding: 20, borderTop: `1px solid ${props.text}14`, display: "grid", gap: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}><span>Subtotal</span><span>{fmt(cartTotal(s), cur)}</span></div>
                        <button style={btn(props)} onClick={() => setState({ view: "checkout" })}>Checkout</button>
                    </footer>
                )}
            </aside>
        </div>
    )
}
addPropertyControls(CartDrawer, {
    title: { type: ControlType.String, defaultValue: "Your cart" },
    width: { type: ControlType.Number, defaultValue: 440, min: 320, max: 640 },
    showDiscount: { type: ControlType.Boolean, title: "Promo codes", defaultValue: true },
    returnPath: { type: ControlType.String, title: "After payment", defaultValue: "/thank-you", description: "Page with the Order Confirmation component." },
    ...lookControls,
})

function CartLines({ look, currency }: { look: Look; currency: string }) {
    const s = useStore()
    if (!s.lines.length) return <p style={{ opacity: 0.7 }}>Your cart is empty.</p>
    const setQty = (key: string, qty: number) => setState((st) => ({ lines: qty <= 0 ? st.lines.filter((l) => l.key !== key) : st.lines.map((l) => (l.key === key ? { ...l, qty } : l)) }))
    return (
        <div style={{ display: "grid", gap: 16 }}>
            {s.lines.map((l) => (
                <div key={l.key} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 64, height: 64, borderRadius: 10, background: `${look.text}10 center/cover no-repeat`, backgroundImage: l.image ? `url(${l.image})` : undefined }} />
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{l.title}</div>
                        <div style={{ fontSize: "0.85em", opacity: 0.7 }}>{[l.variantTitle !== "Default" ? l.variantTitle : "", ...l.modifiers.map((m) => m.name)].filter(Boolean).join(" · ")}</div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                            <button onClick={() => setQty(l.key, l.qty - 1)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${look.text}33`, background: "none", color: look.text, cursor: "pointer" }} aria-label="Less">−</button>
                            <span>{l.qty}</span>
                            <button onClick={() => setQty(l.key, l.qty + 1)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${look.text}33`, background: "none", color: look.text, cursor: "pointer" }} aria-label="More">+</button>
                        </div>
                    </div>
                    <span style={{ fontWeight: 600 }}>{fmt(l.price * l.qty, currency)}</span>
                </div>
            ))}
        </div>
    )
}

function Options({ product, look, currency }: { product: Product; look: Look; currency: string }) {
    const s = useStore()
    const variant = product.product_variants.find((v) => v.id === s.selected[product.id]) ?? product.product_variants[0]
    const [chosen, setChosen] = React.useState<Record<string, string[]>>(() => Object.fromEntries(product.modifiers.filter((g) => g.required).map((g) => [g.name, [g.choices[0]?.name]])))
    const toggle = (g: ModGroup, n: string) => setChosen((c) => { const cur = c[g.name] ?? []; if (g.max === 1) return { ...c, [g.name]: cur[0] === n && !g.required ? [] : [n] }; return { ...c, [g.name]: cur.includes(n) ? cur.filter((x) => x !== n) : cur.length < g.max ? [...cur, n] : cur } })
    const mods = product.modifiers.flatMap((g) => (chosen[g.name] ?? []).map((n) => g.choices.find((c) => c.name === n)!)).filter(Boolean)
    const price = variant.price + mods.reduce((a, m) => a + m.price, 0)
    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", padding: 16 }} onMouseDown={(e) => e.target === e.currentTarget && setState({ picking: null })}>
            <div style={{ width: "min(440px, 100%)", maxHeight: "90vh", overflowY: "auto", background: look.bg, color: look.text, borderRadius: 16, padding: 20, display: "grid", gap: 16, ...look.font }}>
                <b style={{ fontSize: 18 }}>{product.title}</b>
                {product.modifiers.map((g) => (
                    <div key={g.name} style={{ display: "grid", gap: 8 }}>
                        <span style={{ fontSize: "0.85em", opacity: 0.75 }}>{g.name}{g.required ? " (choose one)" : g.max > 1 ? ` (up to ${g.max})` : " (optional)"}</span>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {g.choices.map((c) => { const on = (chosen[g.name] ?? []).includes(c.name); return <button key={c.name} onClick={() => toggle(g, c.name)} style={{ ...look.font, fontSize: 14, padding: "8px 12px", borderRadius: look.radius, border: `1.5px solid ${on ? look.accent : look.text + "33"}`, background: on ? look.accent : "transparent", color: on ? "#fff" : look.text, cursor: "pointer" }}>{c.name}{c.price ? ` +${fmt(c.price, currency)}` : ""}</button> })}
                        </div>
                    </div>
                ))}
                <button style={btn(look)} onClick={() => addToCart(product, variant, s.qty[product.id] || 1, mods)}>Add · {fmt(price, currency)}</button>
                <button style={btn(look, true)} onClick={() => setState({ picking: null })}>Cancel</button>
            </div>
        </div>
    )
}

function Checkout({ look, catalog, showDiscount, returnPath }: { look: Look; catalog: Catalog; showDiscount: boolean; returnPath: string }) {
    const s = useStore()
    const cur = catalog.store?.currency ?? "GHS"
    const pickup = catalog.zones.find((z) => z.fee === 0 && /pick/i.test(z.name))
    const deliveryZones = catalog.zones.filter((z) => z !== pickup)
    const [f, setF] = React.useState({ name: "", phone: "", email: "", line1: "", city: "", zoneId: deliveryZones[0]?.id ?? "", service: deliveryZones.length ? "delivery" : "pickup", code: "", gift: "", pay: catalog.payments.includes("paystack") ? "paystack" : catalog.payments[0] ?? "cod", note: "" })
    const [quote, setQuote] = React.useState<any>(null)
    const [err, setErr] = React.useState("")
    const [busy, setBusy] = React.useState(false)
    const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
    const body = (extra: object = {}) => ({ storeId: STORE.storeId, items: s.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, modifiers: l.modifiers.map((m) => m.name) })), customer: { name: f.name, phone: f.phone, email: f.email }, address: { line1: f.line1, city: f.city }, service: f.service, deliveryZoneId: f.service === "delivery" ? f.zoneId : null, discountCode: f.code || undefined, giftCardCode: f.gift || undefined, paymentMethod: f.pay, note: f.note, ...extra })
    const refresh = React.useCallback(() => { api("quote", body()).then((q) => { setQuote(q); setErr("") }).catch((e) => setErr(e.message)) }, [JSON.stringify(s.lines), f.service, f.zoneId, f.code, f.gift, f.pay]) // eslint-disable-line
    React.useEffect(() => { refresh() }, [refresh])
    const place = async () => {
        if (!f.name.trim() || f.phone.replace(/\D/g, "").length < 9) return setErr("Please add your name and phone number.")
        if (f.service === "delivery" && !f.line1.trim()) return setErr("Please add your delivery address.")
        setBusy(true); setErr("")
        try {
            const back = isBrowser ? window.location.origin + (returnPath || "/") : undefined
            const r = await api("checkout", body({ returnUrl: back }))
            if (r.payUrl) { if (isBrowser) window.location.href = r.payUrl; return }
            setState({ lines: [], view: "done", lastOrder: r })
        } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
    }
    const label: React.CSSProperties = { fontSize: "0.85em", opacity: 0.75, display: "grid", gap: 6 }
    const PAY: Record<string, string> = { paystack: "Mobile Money or card (Paystack)", flutterwave: "Mobile Money or card (Flutterwave)", stripe: "Card (international)", cod: "Pay on delivery / pickup" }
    return (
        <div style={{ display: "grid", gap: 14 }}>
            <label style={label}>Name<input style={input(look)} value={f.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" /></label>
            <label style={label}>Phone (WhatsApp)<input style={input(look)} type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" placeholder="024 000 0000" /></label>
            <label style={label}>Email (optional, for your receipt)<input style={input(look)} type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" /></label>
            {deliveryZones.length > 0 && pickup && (
                <div style={{ display: "flex", gap: 8 }}>
                    {(["delivery", "pickup"] as const).map((k) => <button key={k} onClick={() => set({ service: k })} style={{ ...btn(look, f.service !== k), minHeight: 40 }}>{k === "delivery" ? "Delivery" : "Pickup"}</button>)}
                </div>
            )}
            {f.service === "delivery" && <>
                <label style={label}>Area<select style={input(look)} value={f.zoneId} onChange={(e) => set({ zoneId: e.target.value })}>{deliveryZones.map((z) => <option key={z.id} value={z.id}>{z.name} · {z.fee ? fmt(z.fee, cur) : "Free"}{z.eta ? ` · ${z.eta}` : ""}</option>)}</select></label>
                <label style={label}>Address or landmark<input style={input(look)} value={f.line1} onChange={(e) => set({ line1: e.target.value })} autoComplete="street-address" placeholder="House no., street, nearby landmark" /></label>
            </>}
            {showDiscount && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <label style={label}>Promo code<input style={input(look)} value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></label>
                    <label style={label}>Gift card<input style={input(look)} value={f.gift} onChange={(e) => set({ gift: e.target.value.toUpperCase() })} /></label>
                </div>
            )}
            <div style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: "0.85em", opacity: 0.75 }}>Payment</span>
                {catalog.payments.map((p) => <label key={p} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", border: `1.5px solid ${f.pay === p ? look.accent : look.text + "22"}`, borderRadius: look.radius, cursor: "pointer" }}><input type="radio" checked={f.pay === p} onChange={() => set({ pay: p })} />{PAY[p] ?? p}</label>)}
            </div>
            <label style={label}>Note (optional)<input style={input(look)} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Call when you arrive" /></label>
            {quote && (
                <div style={{ display: "grid", gap: 6, padding: 14, borderRadius: look.radius, background: `${look.text}08` }}>
                    <Row k="Subtotal" v={fmt(quote.subtotal, cur)} />
                    {quote.discountAmount > 0 && <Row k={`Discount (${quote.discountCode})`} v={"−" + fmt(quote.discountAmount, cur)} />}
                    {quote.discountNote && <span style={{ fontSize: "0.85em", color: "#b42318" }}>{quote.discountNote}</span>}
                    <Row k={quote.deliveryMethod} v={quote.deliveryFee ? fmt(quote.deliveryFee, cur) : "Free"} />
                    {quote.giftCardAmount > 0 && <Row k="Gift card" v={"−" + fmt(quote.giftCardAmount, cur)} />}
                    <Row k={<b>Total</b>} v={<b>{fmt(quote.due, cur)}</b>} />
                </div>
            )}
            {err && <p style={{ color: "#b42318", margin: 0 }}>{err}</p>}
            <button style={{ ...btn(look), opacity: busy ? 0.6 : 1 }} disabled={busy || !s.lines.length} onClick={place}>{busy ? "Please wait…" : f.pay === "cod" ? "Place order" : `Pay ${quote ? fmt(quote.due, cur) : ""}`}</button>
        </div>
    )
}
const Row = ({ k, v }: { k: React.ReactNode; v: React.ReactNode }) => <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span>{k}</span><span>{v}</span></div>

function Done({ look, currency, order }: { look: Look; currency: string; order: any }) {
    return (
        <div style={{ display: "grid", gap: 12, textAlign: "center", paddingTop: 20 }}>
            <div style={{ fontSize: 40 }}>✓</div>
            <b style={{ fontSize: 20 }}>Order #{order.number} received</b>
            <p style={{ opacity: 0.75, margin: 0 }}>{order.paid ? "Payment confirmed." : `Total ${fmt(order.total, currency)}, paid on delivery or pickup.`} We’ll contact you on WhatsApp with updates.</p>
            <button style={btn(look, true)} onClick={() => setState({ open: false, view: "cart" })}>Continue shopping</button>
        </div>
    )
}

/**
 * Order Confirmation: put this on the page customers return to after paying.
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
export function OrderConfirmation(props: { heading: string } & Look) {
    const [st, setSt] = React.useState<{ status: "idle" | "checking" | "paid" | "unpaid" | "error"; order?: any; msg?: string }>({ status: "idle" })
    const { catalog } = useCatalog()
    React.useEffect(() => {
        if (!isBrowser) return
        const ref = new URLSearchParams(window.location.search).get("stockroom_ref") || new URLSearchParams(window.location.search).get("reference")
        if (!ref) return
        setSt({ status: "checking" })
        let tries = 0
        const check = () => api(`confirm?ref=${encodeURIComponent(ref)}`).then((r) => {
            if (r.paid) { setSt({ status: "paid", order: r }); setState({ lines: [] }) }
            else if (++tries < 5) setTimeout(check, 2500)
            else setSt({ status: "unpaid" })
        }).catch((e) => setSt({ status: "error", msg: e.message }))
        check()
    }, [])
    const box: React.CSSProperties = { display: "grid", gap: 10, textAlign: "center", color: props.text, ...props.font, padding: 24, borderRadius: props.radius, background: props.bg }
    if (st.status === "idle") return <div style={box}><b>{props.heading}</b><span style={{ opacity: 0.7 }}>Your order details will show here after checkout.</span></div>
    if (st.status === "checking") return <div style={box}>Confirming your payment…</div>
    if (st.status === "paid") return <div style={box}><div style={{ fontSize: 40 }}>✓</div><b style={{ fontSize: 22 }}>{props.heading}</b><span>Order #{st.order.number} · {fmt(st.order.total, catalog?.store?.currency)}</span><span style={{ opacity: 0.7 }}>We’ll message you on WhatsApp when it’s on the way.</span></div>
    if (st.status === "unpaid") return <div style={box}><b>We haven’t received your payment yet</b><span style={{ opacity: 0.7 }}>If money left your account, contact us and we’ll sort it out.</span></div>
    return <div style={box}><b>Something went wrong</b><span style={{ opacity: 0.7 }}>{st.msg}</span></div>
}
addPropertyControls(OrderConfirmation, { heading: { type: ControlType.String, defaultValue: "Thank you for your order!" }, ...lookControls })

/**
 * Product Grid: a ready-made shop grid. Use it when you don't want to design CMS cards.
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
export function ProductGrid(props: { collection: string; columns: number; limit: number; linkPrefix: string; showButton: boolean } & Look) {
    const { catalog, error } = useCatalog()
    if (!configured) return <Hint text="Connect your store with the Stockroom plugin." />
    if (error) return <Hint text={error} />
    if (!catalog) return <Hint text="Loading products…" />
    const col = catalog.collections.find((c) => c.handle === props.collection || c.title.toLowerCase() === props.collection.toLowerCase())
    const list = catalog.products.filter((p) => !props.collection || (col && p.collection_ids.includes(col.id))).slice(0, props.limit || 100)
    const cur = catalog.store?.currency
    return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${Math.floor(900 / props.columns)}px, 1fr))`, gap: 20, color: props.text, ...props.font, width: "100%" }}>
            {list.map((p) => {
                const v = p.product_variants[0]
                return (
                    <div key={p.id} style={{ display: "grid", gap: 8 }}>
                        <a href={`${props.linkPrefix}${p.handle}`} style={{ color: "inherit", textDecoration: "none", display: "grid", gap: 8 }}>
                            <div style={{ aspectRatio: "4/5", borderRadius: props.radius, background: `hsl(${p.hue} 30% 88%) center/cover no-repeat`, backgroundImage: p.images[0] ? `url(${p.images[0]})` : undefined }} />
                            <span style={{ fontWeight: 600 }}>{p.title}</span>
                            <span>{fmt(v?.price ?? 0, cur)} {v?.compare_at && v.compare_at > v.price ? <s style={{ opacity: 0.5 }}>{fmt(v.compare_at, cur)}</s> : null}</span>
                        </a>
                        {props.showButton && <button style={{ ...btn(props), minHeight: 40, opacity: inStock(v) ? 1 : 0.5 }} disabled={!inStock(v)} onClick={() => tapAdd(p, v)}>{inStock(v) ? "Add to cart" : "Sold out"}</button>}
                    </div>
                )
            })}
        </div>
    )
}
const Hint = ({ text }: { text: string }) => <div style={{ padding: 20, border: "1px dashed #aaa", borderRadius: 12, color: "#666", fontFamily: "sans-serif", fontSize: 14 }}>{text}</div>
addPropertyControls(ProductGrid, {
    collection: { type: ControlType.String, title: "Collection", placeholder: "All products", description: "Collection name or slug" },
    columns: { type: ControlType.Number, defaultValue: 3, min: 1, max: 6, displayStepper: true },
    limit: { type: ControlType.Number, defaultValue: 12, min: 1, max: 100 },
    linkPrefix: { type: ControlType.String, title: "Link to", defaultValue: "/products/" },
    showButton: { type: ControlType.Boolean, title: "Add button", defaultValue: true },
    ...lookControls,
})

/**
 * Menu: a restaurant menu grouped by category, with add-ons. Orders go to the kitchen screen.
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
export function Menu(props: { showImages: boolean } & Look) {
    const { catalog } = useCatalog()
    if (!configured) return <Hint text="Connect your store with the Stockroom plugin." />
    if (!catalog) return <Hint text="Loading menu…" />
    const cur = catalog.store?.currency
    return (
        <div style={{ display: "grid", gap: 36, color: props.text, ...props.font, width: "100%" }}>
            {catalog.collections.map((c) => {
                const items = catalog.products.filter((p) => p.collection_ids.includes(c.id))
                if (!items.length) return null
                return (
                    <section key={c.id} style={{ display: "grid", gap: 14 }}>
                        <h3 style={{ margin: 0, fontSize: "1.3em" }}>{c.title}</h3>
                        {items.map((p) => {
                            const v = p.product_variants[0]
                            return (
                                <div key={p.id} style={{ display: "grid", gridTemplateColumns: props.showImages && p.images[0] ? "72px 1fr auto" : "1fr auto", gap: 14, alignItems: "center", paddingBottom: 14, borderBottom: `1px solid ${props.text}14` }}>
                                    {props.showImages && p.images[0] && <div style={{ width: 72, height: 72, borderRadius: 10, background: `center/cover url(${p.images[0]})` }} />}
                                    <div><b>{p.title}</b><div style={{ fontSize: "0.85em", opacity: 0.7 }}>{p.description}</div></div>
                                    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}><span style={{ fontWeight: 600 }}>{fmt(v.price, cur)}</span><button onClick={() => tapAdd(p, v)} disabled={!inStock(v)} style={{ ...btn(props), minHeight: 34, width: "auto", padding: "6px 14px", opacity: inStock(v) ? 1 : 0.5 }}>{inStock(v) ? "Add" : "Sold out"}</button></div>
                                </div>
                            )
                        })}
                    </section>
                )
            })}
        </div>
    )
}
addPropertyControls(Menu, { showImages: { type: ControlType.Boolean, title: "Photos", defaultValue: true }, ...lookControls })

/**
 * Book A Table: reservation form for restaurants. Shows as a pop-up when "withBookTable" is clicked, or inline.
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
export function BookTable(props: { inline: boolean; heading: string } & Look) {
    const s = useStore()
    const { catalog } = useCatalog()
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    const [day, setDay] = React.useState(today)
    const [party, setParty] = React.useState(2)
    const [slots, setSlots] = React.useState<string[] | null>(null)
    const [slot, setSlot] = React.useState("")
    const [f, setF] = React.useState({ name: "", phone: "", email: "", notes: "" })
    const [msg, setMsg] = React.useState("")
    const [done, setDone] = React.useState(false)
    const cfg = catalog?.store?.reservations
    React.useEffect(() => { if (!configured) return; setSlots(null); setSlot(""); rpc("available_slots", { sid: STORE.storeId, day, party }).then((r) => setSlots(r.map((x: any) => x.slot ?? x))).catch(() => setSlots([])) }, [day, party])
    if (!props.inline && !s.booking) return null
    const book = async () => {
        if (!slot || !f.name.trim() || f.phone.replace(/\D/g, "").length < 9) return setMsg("Pick a time and add your name and phone number.")
        try { await rpc("book_table", { sid: STORE.storeId, guest_name: f.name, guest_phone: f.phone, guest_email: f.email, party, at: slot, notes: f.notes }); setDone(true); setMsg("") } catch (e: any) { setMsg(e.message) }
    }
    const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    const body = (
        <div style={{ display: "grid", gap: 14, color: props.text, background: props.bg, padding: props.inline ? 0 : 20, borderRadius: 16, ...props.font, width: props.inline ? "100%" : "min(460px, 100%)" }}>
            <b style={{ fontSize: 20 }}>{props.heading}</b>
            {done ? <p style={{ margin: 0 }}>You’re booked for {party} on {new Date(slot).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. See you soon! {cfg?.deposit_amount && party >= cfg.deposit_over_party ? "We’ll contact you about the deposit." : ""}</p> : <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8 }}>
                    <input type="date" min={today} value={day} onChange={(e) => setDay(e.target.value)} style={input(props)} aria-label="Date" />
                    <select value={party} onChange={(e) => setParty(Number(e.target.value))} style={input(props)} aria-label="People">{Array.from({ length: cfg?.max_party ?? 8 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} {n === 1 ? "person" : "people"}</option>)}</select>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {slots === null ? <span style={{ opacity: 0.7 }}>Checking times…</span> : slots.length ? slots.map((t) => <button key={t} onClick={() => setSlot(t)} style={{ ...props.font, fontSize: 14, padding: "8px 12px", borderRadius: props.radius, border: `1.5px solid ${slot === t ? props.accent : props.text + "33"}`, background: slot === t ? props.accent : "transparent", color: slot === t ? "#fff" : props.text, cursor: "pointer" }}>{time(t)}</button>) : <span style={{ opacity: 0.7 }}>No free times that day. Try another day{cfg?.max_party ? ` or call us for groups over ${cfg.max_party}` : ""}.</span>}
                </div>
                <input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={input(props)} autoComplete="name" />
                <input placeholder="Phone (WhatsApp)" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} style={input(props)} autoComplete="tel" />
                <input placeholder="Anything we should know? (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} style={input(props)} />
                {msg && <p style={{ color: "#b42318", margin: 0 }}>{msg}</p>}
                <button style={btn(props)} onClick={book}>Book table</button>
            </>}
            {!props.inline && <button style={btn(props, true)} onClick={() => { setState({ booking: false }); setDone(false) }}>Close</button>}
        </div>
    )
    if (props.inline) return body
    return <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", padding: 16 }} onMouseDown={(e) => e.target === e.currentTarget && setState({ booking: false })}>{body}</div>
}
addPropertyControls(BookTable, { inline: { type: ControlType.Boolean, title: "Show on page", defaultValue: true, description: "Off = pop-up opened by withBookTable" }, heading: { type: ControlType.String, defaultValue: "Book a table" }, ...lookControls })
