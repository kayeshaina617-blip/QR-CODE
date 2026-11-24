import React, { useEffect, useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase, supabaseReady } from "./supabase";

const ADMIN_EMAIL = "kayeshaina617@gmail.com";

function messageOf(error) {
  return error?.message || "Something went wrong. Please try again.";
}
function money(value) {
  return `₱${Number(value || 0).toFixed(2)}`;
}
function makeOrderNo() {
  return `QR-${Date.now().toString().slice(-8)}`;
}

export default function App() {
  const [page, setPage] = useState("shop");
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [orderResult, setOrderResult] = useState("");
  const [form, setForm] = useState({
    customer_name: "", customer_contact: "", pickup_date: "", pickup_time: "", notes: ""
  });
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState([]);
  const [adminItems, setAdminItems] = useState([]);
  const [productForm, setProductForm] = useState({
    name: "", description: "", price: "", image_url: "", available: true
  });
  const [editingId, setEditingId] = useState(null);

  const cartItems = useMemo(
    () => products.filter(p => Number(cart[p.id] || 0) > 0),
    [products, cart]
  );
  const total = cartItems.reduce((sum, p) => sum + Number(p.price) * Number(cart[p.id]), 0);

  useEffect(() => {
    if (!supabaseReady) return;
    loadProducts();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, current) => {
      setSession(current);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProducts() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("id,name,description,price,image_url,available")
      .eq("available", true)
      .order("created_at", { ascending: false });
    if (error) setNotice(messageOf(error));
    else setProducts(data || []);
    setLoading(false);
  }

  function setQty(id, value) {
    const quantity = Math.max(0, Math.min(99, Number(value) || 0));
    setCart(old => ({ ...old, [id]: quantity }));
  }
  function updateForm(field, value) {
    setForm(old => ({ ...old, [field]: value }));
  }

  async function submitOrder(event) {
    event.preventDefault();
    setNotice("");
    if (!cartItems.length) return setNotice("Please select at least one product.");
    if (!form.customer_name.trim() || !form.customer_contact.trim() ||
        !form.pickup_date || !form.pickup_time) {
      return setNotice("Please complete your name, contact number, pickup date, and pickup time.");
    }
    const today = new Date();
    today.setHours(0,0,0,0);
    if (new Date(`${form.pickup_date}T00:00:00`) < today) {
      return setNotice("Please choose today or a future pickup date.");
    }
    setLoading(true);
    const orderNo = makeOrderNo();
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_no: orderNo,
        customer_name: form.customer_name.trim(),
        customer_contact: form.customer_contact.trim(),
        pickup_date: form.pickup_date,
        pickup_time: form.pickup_time,
        notes: form.notes.trim() || null,
        status: "Pending"
      })
      .select("id,order_no")
      .single();

    if (orderError) {
      setNotice(messageOf(orderError));
      setLoading(false);
      return;
    }

    const rows = cartItems.map(p => ({
      order_id: order.id,
      product_id: p.id,
      quantity: Number(cart[p.id]),
      unit_price: Number(p.price)
    }));
    const { error: itemsError } = await supabase.from("order_items").insert(rows);
    if (itemsError) {
      setNotice(`Order ${orderNo} was created, but its items could not be saved. Please contact the administrator. Details: ${messageOf(itemsError)}`);
      setLoading(false);
      return;
    }
    setOrderResult(orderNo);
    setCart({});
    setForm({ customer_name: "", customer_contact: "", pickup_date: "", pickup_time: "", notes: "" });
    setLoading(false);
    setPage("confirmation");
  }

  async function adminLogin(event) {
    event.preventDefault();
    setNotice("");
    if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
      setNotice("This email is not the authorized administrator account.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password
    });
    if (error) setNotice(messageOf(error));
    else {
      setPassword("");
      setPage("admin");
      await loadAdminData();
    }
    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    setOrders([]);
    setAdminItems([]);
    setPage("shop");
  }

  async function loadAdminData() {
    if (!supabase) return;
    setLoading(true);
    const [ordersResult, itemsResult] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("order_items").select("id,order_id,product_id,quantity,unit_price")
    ]);
    if (ordersResult.error) setNotice(messageOf(ordersResult.error));
    else setOrders(ordersResult.data || []);
    if (itemsResult.error) setNotice(messageOf(itemsResult.error));
    else setAdminItems(itemsResult.data || []);
    setLoading(false);
  }

  async function saveProduct(event) {
    event.preventDefault();
    const payload = {
      name: productForm.name.trim(),
      description: productForm.description.trim(),
      price: Number(productForm.price),
      image_url: productForm.image_url.trim() || null,
      available: Boolean(productForm.available)
    };
    if (!payload.name || !Number.isFinite(payload.price) || payload.price < 0) {
      setNotice("Enter a product name and a valid non-negative price.");
      return;
    }
    setLoading(true);
    const query = editingId
      ? supabase.from("products").update(payload).eq("id", editingId)
      : supabase.from("products").insert(payload);
    const { error } = await query;
    if (error) setNotice(messageOf(error));
    else {
      setNotice("Product saved.");
      setProductForm({ name: "", description: "", price: "", image_url: "", available: true });
      setEditingId(null);
      await loadProducts();
      await loadAdminProducts();
    }
    setLoading(false);
  }

  async function loadAdminProducts() {
    const { data, error } = await supabase.from("products")
      .select("id,name,description,price,image_url,available")
      .order("created_at", { ascending: false });
    if (error) setNotice(messageOf(error));
    else setProducts(data || []);
  }

  async function removeProduct(id) {
    if (!window.confirm("Delete this product?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) setNotice(messageOf(error));
    else {
      setNotice("Product deleted.");
      await loadAdminProducts();
    }
  }

  function editProduct(p) {
    setEditingId(p.id);
    setProductForm({
      name: p.name || "", description: p.description || "",
      price: String(p.price ?? ""), image_url: p.image_url || "",
      available: Boolean(p.available)
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function changeStatus(orderId, status) {
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) setNotice(messageOf(error));
    else {
      setNotice("Order status updated.");
      await loadAdminData();
    }
  }

  function itemSummary(orderId) {
    const rows = adminItems.filter(i => i.order_id === orderId);
    return rows.map(i => {
      const product = products.find(p => p.id === i.product_id);
      return `${product?.name || "Product"} × ${i.quantity} (${money(i.unit_price)})`;
    }).join(", ") || "Order items are not available.";
  }

  if (!supabaseReady) {
    return <main className="shell"><section className="panel">
      <h1>QR Advance Ordering</h1>
      <p>Supabase is not connected yet. Add your Project URL and publishable key to the environment variables before publishing.</p>
      <p>Do not use a secret or service-role key in this website.</p>
    </section></main>;
  }

  return <main className="shell">
    <header className="topbar">
      <div><p className="eyebrow">SMALL-SCALE BUSINESS</p><h1>QR Advance Ordering</h1></div>
      <nav>
        <button className={page === "shop" ? "active" : ""} onClick={() => { setPage("shop"); setNotice(""); }}>Shop</button>
        <button className={page === "admin" || page === "login" ? "active" : ""} onClick={() => { setPage(session ? "admin" : "login"); setNotice(""); }}>Admin</button>
      </nav>
    </header>

    {notice && <div className="notice" role="status">{notice}</div>}

    {page === "shop" && <>
      <section className="intro">
        <div><p className="eyebrow">ORDER AHEAD, PICK UP LATER</p><h2>Browse products and place your order.</h2>
          <p>Choose available products, select your pickup schedule, and submit your order. Payment is handled in person at pickup.</p></div>
      </section>
      <section className="section-head"><div><h2>Available products</h2><p>Select the quantity you want.</p></div>
        <button className="outline" onClick={loadProducts}>Refresh</button></section>
      {loading && <p className="muted">Loading…</p>}
      <div className="product-grid">
        {products.map(p => <article className="product-card" key={p.id}>
          {p.image_url ? <img src={p.image_url} alt={p.name} onError={e => { e.currentTarget.style.display = "none"; }} /> : <div className="image-placeholder">Product</div>}
          <div className="product-content"><h3>{p.name}</h3><p>{p.description}</p><strong>{money(p.price)}</strong>
            <label>Quantity<input type="number" min="0" max="99" value={cart[p.id] || 0} onChange={e => setQty(p.id, e.target.value)} /></label></div>
        </article>)}
      </div>
      {!products.length && !loading && <p className="empty">No available products have been added yet.</p>}
      <section className="panel order-panel">
        <h2>Advance order details</h2>
        <p className="muted">Your order total: <strong>{money(total)}</strong></p>
        <form onSubmit={submitOrder} className="form-grid">
          <label>Customer name<input required value={form.customer_name} onChange={e => updateForm("customer_name", e.target.value)} /></label>
          <label>Contact number<input required type="tel" value={form.customer_contact} onChange={e => updateForm("customer_contact", e.target.value)} /></label>
          <label>Pickup date<input required type="date" min={new Date().toISOString().slice(0,10)} value={form.pickup_date} onChange={e => updateForm("pickup_date", e.target.value)} /></label>
          <label>Pickup time<input required type="time" value={form.pickup_time} onChange={e => updateForm("pickup_time", e.target.value)} /></label>
          <label className="wide">Notes (optional)<textarea rows="3" value={form.notes} onChange={e => updateForm("notes", e.target.value)} /></label>
          <button className="primary wide" disabled={loading || !cartItems.length}>{loading ? "Submitting…" : "Submit advance order"}</button>
        </form>
      </section>
    </>}

    {page === "confirmation" && <section className="panel center">
      <p className="eyebrow">ORDER SUBMITTED</p><h2>Thank you for your order!</h2>
      <p>Your order number is:</p><div className="order-number">{orderResult}</div>
      <p>Please keep this number and present it when collecting your order. Payment is made at pickup.</p>
      <button className="primary" onClick={() => setPage("shop")}>Back to products</button>
    </section>}

    {page === "login" && <section className="panel narrow">
      <h2>Administrator login</h2><p className="muted">Only the authorized administrator can access this area.</p>
      <form onSubmit={adminLogin} className="stack">
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        <button className="primary" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      </form>
    </section>}

    {page === "admin" && <section>
      {!session ? <div className="panel"><h2>Admin session required</h2><button className="primary" onClick={() => setPage("login")}>Go to login</button></div> :
      <>
        <div className="section-head"><div><p className="eyebrow">ADMINISTRATOR</p><h2>Manage ordering system</h2><p className="muted">Signed in as {session.user.email}</p></div>
          <div className="button-row"><button className="outline" onClick={async () => { await loadAdminProducts(); await loadAdminData(); }}>Refresh</button><button className="outline" onClick={logout}>Sign out</button></div></div>
        <div className="admin-grid">
          <section className="panel"><h3>{editingId ? "Edit product" : "Add product"}</h3>
            <form onSubmit={saveProduct} className="stack">
              <label>Product name<input required value={productForm.name} onChange={e => setProductForm({...productForm,name:e.target.value})} /></label>
              <label>Description<textarea rows="2" value={productForm.description} onChange={e => setProductForm({...productForm,description:e.target.value})} /></label>
              <label>Price (₱)<input required type="number" min="0" step="0.01" value={productForm.price} onChange={e => setProductForm({...productForm,price:e.target.value})} /></label>
              <label>Image URL (optional)<input type="url" value={productForm.image_url} onChange={e => setProductForm({...productForm,image_url:e.target.value})} /></label>
              <label className="check"><input type="checkbox" checked={productForm.available} onChange={e => setProductForm({...productForm,available:e.target.checked})} /> Available for customers</label>
              <button className="primary" disabled={loading}>{editingId ? "Save changes" : "Add product"}</button>
              {editingId && <button type="button" className="outline" onClick={() => {setEditingId(null);setProductForm({name:"",description:"",price:"",image_url:"",available:true});}}>Cancel edit</button>}
            </form>
          </section>
          <section className="panel"><h3>Products</h3>
            {products.map(p => <div className="list-row" key={p.id}><div><strong>{p.name}</strong><p>{money(p.price)} · {p.available ? "Available" : "Unavailable"}</p></div>
              <div className="button-row"><button className="small" onClick={() => editProduct(p)}>Edit</button><button className="small danger" onClick={() => removeProduct(p.id)}>Delete</button></div></div>)}
          </section>
        </div>
        <section className="panel orders-panel"><h3>Customer orders</h3>
          {orders.length === 0 && <p className="muted">No orders yet.</p>}
          {orders.map(o => <article className="order-card" key={o.id}>
            <div className="order-head"><div><strong>{o.order_no || o.id}</strong><p>{o.customer_name} · {o.customer_contact}</p></div>
              <select value={o.status || "Pending"} onChange={e => changeStatus(o.id,e.target.value)}>
                {["Pending","Accepted","Preparing","Ready for pickup","Completed","Rejected"].map(s => <option key={s}>{s}</option>)}
              </select></div>
            <p>Pickup: {o.pickup_date} at {o.pickup_time}</p>
            <p>Notes: {o.notes || "None"}</p>
            <p className="muted">Order item records: {adminItems.filter(i => i.order_id === o.id).map(i => `${i.product_id} × ${i.quantity}`).join(", ") || "Not found"}</p>
          </article>)}
        </section>
        <section className="panel qr-panel"><h3>Customer QR code</h3><p className="muted">After deployment, copy your public website address and use it to create the customer QR code.</p>
          <p>The QR code should point to your published customer ordering page.</p>
        </section>
      </>}
    </section>}

    <footer>QR Code-Based Digital Platform for Advance Ordering in Small-Scale Business Operations</footer>
  </main>;
}