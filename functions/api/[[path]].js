const PAYMENTS = new Set(['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Tarjeta']);
const PASSWORD_ITERATIONS = 100_000; // Cloudflare Workers WebCrypto maximum for PBKDF2.
const enc = new TextEncoder();
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const err = (message, status = 400) => Object.assign(new Error(message), { status });
const rand = n => { const b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map(x => x.toString(16).padStart(2, '0')).join('') };
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = s => Uint8Array.from(s.match(/.{2}/g) || [], x => parseInt(x,16));
async function digest(value) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(value))) }
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS }, key, 256);
  return `pbkdf2$${PASSWORD_ITERATIONS}$${hex(salt)}$${hex(result)}`;
}
async function verifyPassword(password, stored) {
  try {
    const [, iterations, saltHex, expected] = stored.split('$');
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const result = hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: Number(iterations) }, key, 256));
    return result.length === expected.length && [...result].reduce((n,c,i)=>n | c.charCodeAt(0)^expected.charCodeAt(i),0) === 0;
  } catch { return false }
}
function cookieValue(request) { return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('k17='))?.slice(4) || '' }
function cookie(token, request, clear = false) { const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''; return `k17=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear?0:28800}${secure}` }
async function readBody(request, max = 8_000_000) {
  const length = Number(request.headers.get('content-length') || 0);
  if(length > max) throw err('La solicitud es demasiado grande',413);
  const raw = await request.arrayBuffer(); if(raw.byteLength > max) throw err('La solicitud es demasiado grande',413);
  try { return JSON.parse(new TextDecoder().decode(raw) || '{}') } catch { throw err('Datos no válidos') }
}
const userPublic = u => ({id:u.id,name:u.name,username:u.username,role:u.role,commission:u.commission,active:!!u.active});
async function currentUser(request, env) {
  const token = cookieValue(request); if(!token) return null;
  return env.K17_DB.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`).bind(await digest(token),new Date().toISOString()).first();
}
function requireRole(user, role) { if(!user) throw err('Inicia sesión para continuar',401); if(user.role!==role) throw err('No tienes permiso para esta acción',403) }
function cents(n) { return Math.round(Number(n)) }
function moneyOK(n) { return Number.isFinite(n) && Number.isInteger(n) }
function localDateExpr() { return "date(created_at, '-5 hours')" }
function periodWhere(period, table='') {
  const column=table?`${table}.created_at`:'created_at',local=`date(${column}, '-5 hours')`;
  if(period==='yesterday')return `${local}=date('now','-5 hours','-1 day')`;
  if(period==='week')return `${local}>=date('now','-5 hours','-' || ((CAST(strftime('%w',date('now','-5 hours')) AS INTEGER)+6)%7) || ' days')`;
  if(period==='month')return `strftime('%Y-%m',${column},'-5 hours')=strftime('%Y-%m','now','-5 hours')`;
  if(period==='all')return '1=1';
  return `${local}=date('now','-5 hours')`;
}
function imageData(value) {
  if(typeof value!=='string'||!value)return null;
  const match=value.match(/^data:image\/(png|jpeg|webp);base64,([\w+/=]+)$/);
  if(!match)throw err('Usa imágenes PNG, JPG o WebP de máximo 2 MB');
  let binary;try{binary=atob(match[2])}catch{throw err('La imagen no es válida')}
  if(binary.length>2_000_000)throw err('Usa imágenes PNG, JPG o WebP de máximo 2 MB');
  const b=Uint8Array.from(binary,c=>c.charCodeAt(0)),type=match[1];
  const good=type==='png'?b.length>8&&[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x):type==='jpeg'?b.length>3&&b[0]===255&&b[1]===216&&b[2]===255:b.length>12&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
  if(!good)throw err('El archivo no coincide con el formato de imagen permitido');
  return {bytes:b,type:`image/${type}`,key:`${crypto.randomUUID()}.${type==='jpeg'?'jpg':type}`};
}
function imageBase64(bytes) { let binary=''; for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(binary) }
async function driveCall(env,payload) {
  if(!env.K17_DRIVE_URL||!env.K17_DRIVE_KEY)throw err('La conexión con Google Drive todavía no está configurada. Registra el pedido sin foto o avisa al administrador.',503);
  let response,data;
  try { response=await fetch(env.K17_DRIVE_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,key:env.K17_DRIVE_KEY})}); data=await response.json(); }
  catch { throw err('No se pudo conectar con Google Drive. Intenta de nuevo.',502) }
  if(!response.ok||!data?.ok)throw err(data?.error||'Google Drive no pudo completar la operación.',502);
  return data;
}
async function orderList(request, user, env) {
  const url=new URL(request.url),p=url.searchParams,where=[],args=[];
  if(user.role==='worker'){where.push('o.worker_id=?');args.push(user.id)}
  for(const [key,column] of [['worker','o.worker_id'],['payment','o.payment']])if(user.role==='admin'&&p.get(key)){where.push(`${column}=?`);args.push(key==='worker'?Number(p.get(key)):p.get(key))}
  if(p.get('q')){where.push(`(printf('%06d',CAST(o.number AS INTEGER)) LIKE ? OR o.number LIKE ? OR o.customer LIKE ? OR o.phone LIKE ?)`);args.push(...Array(4).fill(`%${p.get('q').slice(0,50)}%`))}
  if(user.role==='admin')for(const [k,cmp] of [['from','>='],['to','<=']])if(p.get(k)){where.push(`date(o.created_at,'-5 hours') ${cmp} date(?)`);args.push(p.get(k))}
  const sql=`SELECT o.id,o.number,o.customer,o.phone,o.address,o.payment,o.notes,o.worker_id workerId,u.name worker,o.created_at createdAt,o.total,o.commission_rate commissionRate FROM orders o JOIN users u ON u.id=o.worker_id${where.length?' WHERE '+where.join(' AND '):''} ORDER BY o.created_at DESC LIMIT 300`;
  if(p.has('details')){const own=user.role==='worker'?' AND o.worker_id=?':'';const dArgs=own?[p.get('details'),user.id]:[p.get('details')];const o=await env.K17_DB.prepare(`SELECT o.id,o.number,o.customer,o.phone,o.address,o.payment,o.notes,o.worker_id workerId,u.name worker,o.created_at createdAt,o.total,o.commission_rate commissionRate FROM orders o JOIN users u ON u.id=o.worker_id WHERE o.id=?${own}`).bind(...dArgs).first();if(!o)return json({order:null});const items=await env.K17_DB.prepare('SELECT id,name,qty,size,price,image_key imageKey FROM items WHERE order_id=?').bind(o.id).all();return json({order:{...o,number:String(o.number).padStart(6,'0'),commission:o.total*o.commissionRate/100,items:items.results.map(i=>({...i,image:i.imageKey?`/api/media/${i.imageKey}`:'',driveUrl:i.imageKey?`https://drive.google.com/file/d/${encodeURIComponent(i.imageKey)}/view`:''}))}})}
  const found=await env.K17_DB.prepare(sql).bind(...args).all();
  return json({orders:found.results.map(o=>({...o,number:String(o.number).padStart(6,'0')}))});
}
async function createOrder(request,user,env) {
  const b=await readBody(request),items=Array.isArray(b.items)?b.items:[];
  if(!b.customer?.trim()||!b.phone?.trim()||!b.address?.trim()||!PAYMENTS.has(b.payment)||items.length<1||items.length>30)throw err('Completa los datos requeridos y agrega al menos una prenda');
  let total=0;const prepared=[];
  for(const it of items){const qty=Number(it.qty),price=Number(it.price);if(!it.name?.trim()||!Number.isInteger(qty)||qty<1||qty>99||!moneyOK(price)||price<0||price>100_000_000)throw err('Revisa nombre, cantidad y precio de cada prenda');total+=qty*price;const image=imageData(it.image);prepared.push({id:crypto.randomUUID(),name:it.name.trim().slice(0,100),qty,size:String(it.size||'Única').slice(0,12),price,image})}
  const orderId=crypto.randomUUID(),sequence=await env.K17_DB.prepare("UPDATE settings SET value=CAST(value AS INTEGER)+1 WHERE key='order_sequence' RETURNING value").first('value');
  if(!sequence)throw err('No se pudo asignar el número de pedido',500);
  const number=String(sequence),createdAt=new Date().toISOString(),uploaded=[];
  try{
    for(const i of prepared)if(i.image){const saved=await driveCall(env,{action:'upload',name:i.image.key,mime:i.image.type,data:imageBase64(i.image.bytes)});i.image.key=saved.id;uploaded.push(saved.id)}
    const stmts=[env.K17_DB.prepare('INSERT INTO orders(id,number,customer,phone,address,payment,notes,worker_id,commission_rate,created_at,total) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(orderId,number,b.customer.trim().slice(0,120),b.phone.trim().slice(0,30),b.address.trim().slice(0,240),b.payment,String(b.notes||'').slice(0,1000),user.id,user.commission,createdAt,total)];
    for(const i of prepared)stmts.push(env.K17_DB.prepare('INSERT INTO items(id,order_id,name,qty,size,price,image_key) VALUES(?,?,?,?,?,?,?)').bind(i.id,orderId,i.name,i.qty,i.size,i.price,i.image?.key||''));
    await env.K17_DB.batch(stmts);return json({id:orderId,number:number.padStart(6,'0'),total},201);
  }catch(e){await Promise.all(uploaded.map(id=>driveCall(env,{action:'delete',id}).catch(()=>{})));throw e}
}
async function summary(user,env,url) {
  const cond=periodWhere(url.searchParams.get('period')||'today'),mine=user.role==='worker'?' AND worker_id=?':'';
  const totals=await env.K17_DB.prepare(`SELECT COUNT(*) orders,COALESCE(SUM(total),0) sales,COALESCE(SUM(total*commission_rate/100),0) commission FROM orders WHERE ${cond}${mine}`).bind(...(mine?[user.id]:[])).first();
  const staff=user.role==='admin'?(await env.K17_DB.prepare(`SELECT u.id,u.name,u.commission,COUNT(o.id) orders,COALESCE(SUM(o.total),0) sales,COALESCE(SUM(o.total*o.commission_rate/100),0) commission FROM users u LEFT JOIN orders o ON o.worker_id=u.id AND ${periodWhere(url.searchParams.get('period')||'today','o')} WHERE u.role='worker' GROUP BY u.id ORDER BY sales DESC`).all()).results:[];
  return json({...totals,staff});
}
export async function onRequest(context) {
 const {request,env}=context;try{
  const url=new URL(request.url),path=(context.params.path||[]).join('/');
  if(request.method==='GET'&&path==='setup-status'){const row=await env.K17_DB.prepare('SELECT COUNT(*) n FROM users').first();return json({needed:!row.n})}
  if(request.method==='POST'&&path==='setup'){
   const b=await readBody(request);
   let keyOK=false;if(env.K17_SETUP_KEY&&typeof b.key==='string'&&b.key.length===env.K17_SETUP_KEY.length){let diff=0;for(let i=0;i<b.key.length;i++)diff|=b.key.charCodeAt(i)^env.K17_SETUP_KEY.charCodeAt(i);keyOK=diff===0}
   if(!keyOK)throw err('La clave de configuración no es válida',403);
   if(!b.name?.trim()||!/^\w{3,24}$/.test(b.username||'')||String(b.password||'').length<12)throw err('Indica nombre, usuario válido y contraseña de al menos 12 caracteres');
   const adminHash=await hashPassword(b.password),result=await env.K17_DB.batch([env.K17_DB.prepare("UPDATE settings SET value='1' WHERE key='setup_complete' AND value='0' RETURNING value"),env.K17_DB.prepare("INSERT INTO users(name,username,pass_hash,role,commission) SELECT ?,?,?,'admin',0 WHERE (SELECT value FROM settings WHERE key='setup_complete')='1' AND (SELECT COUNT(*) FROM users)=0").bind(b.name.trim().slice(0,120),b.username,adminHash)]);
   if(!(result[1]?.meta?.changes>0))throw err('La cuenta inicial ya se creó; inicia sesión.',409);
   const admin=await env.K17_DB.prepare('SELECT * FROM users WHERE username=?').bind(b.username).first(),token=rand(32);await env.K17_DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await digest(token),admin.id,new Date(Date.now()+28800000).toISOString()).run();return json({user:userPublic(admin)},200,{'Set-Cookie':cookie(token,request)});
  }
  if(request.method==='POST'&&path==='login'){
   const b=await readBody(request),u=await env.K17_DB.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').bind(String(b.username||'')).first();if(!u||!u.active||!await verifyPassword(String(b.password||''),u.pass_hash))throw err('Usuario o contraseña incorrectos',401);
   const token=rand(32);await env.K17_DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await digest(token),u.id,new Date(Date.now()+28800000).toISOString()).run();return json({user:userPublic(u)},200,{'Set-Cookie':cookie(token,request)});
  }
  if(request.method==='POST'&&path==='logout'){const token=cookieValue(request);if(token)await env.K17_DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();return json({ok:true},200,{'Set-Cookie':cookie('',request,true)})}
  const user=await currentUser(request,env);if(!user)throw err('Inicia sesión para continuar',401);
  if(request.method==='GET'&&path==='me')return json({user:userPublic(user)});
  if(request.method==='POST'&&path==='me/password'){const b=await readBody(request);if(!await verifyPassword(String(b.current||''),user.pass_hash))throw err('La contraseña actual no coincide');if(String(b.password||'').length<8)throw err('La nueva contraseña debe tener al menos 8 caracteres');await env.K17_DB.prepare('UPDATE users SET pass_hash=? WHERE id=?').bind(await hashPassword(b.password),user.id).run();return json({ok:true})}
  if(request.method==='GET'&&path==='summary')return summary(user,env,url);
  if(request.method==='GET'&&path==='orders')return orderList(request,user,env);
  if(request.method==='POST'&&path==='orders'){requireRole(user,'worker');return createOrder(request,user,env)}
  if(path.startsWith('media/')){const key=path.slice('media/'.length);if(!/^[\w.-]{10,100}$/.test(key))throw err('Imagen no encontrada',404);const item=await env.K17_DB.prepare('SELECT i.image_key FROM items i JOIN orders o ON o.id=i.order_id WHERE i.image_key=? AND (?=\'admin\' OR o.worker_id=?)').bind(key,user.role,user.id).first();if(!item)throw err('Imagen no encontrada',404);const file=await driveCall(env,{action:'download',id:key});if(!/^image\/(png|jpeg|webp)$/.test(file.mime||''))throw err('Imagen no encontrada',404);const binary=atob(file.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),h=new Headers({'content-type':file.mime,'cache-control':'private, no-store','x-content-type-options':'nosniff'});return new Response(bytes,{headers:h})}
  if(path==='workers'&&request.method==='GET'){requireRole(user,'admin');const rows=await env.K17_DB.prepare("SELECT * FROM users WHERE role='worker' ORDER BY name").all();return json({workers:rows.results.map(userPublic)})}
  if(path==='workers'&&request.method==='POST'){requireRole(user,'admin');const b=await readBody(request),commission=Number(b.commission??5);if(!b.name?.trim()||!/^\w{3,24}$/.test(b.username||'')||String(b.password||'').length<8||!Number.isFinite(commission)||commission<0||commission>100)throw err('Indica nombre, usuario, contraseña de al menos 8 caracteres y comisión entre 0 y 100 %');try{const r=await env.K17_DB.prepare("INSERT INTO users(name,username,pass_hash,role,commission) VALUES(?,?,?,'worker',?)").bind(b.name.trim().slice(0,120),b.username,await hashPassword(b.password),commission).run();return json({id:r.meta.last_row_id},201)}catch{throw err('Ese usuario ya existe',409)}}
  const w=path.match(/^workers\/(\d+)$/);if(w&&request.method==='PATCH'){requireRole(user,'admin');const b=await readBody(request),sets=[],vals=[];for(const k of ['name','active','commission','password'])if(b[k]!==undefined){sets.push(k==='password'?'pass_hash=?':`${k}=?`);vals.push(k==='password'?await hashPassword(String(b[k])):k==='active'?(b[k]?1:0):k==='commission'?Math.min(100,Math.max(0,Number(b[k]))):String(b[k]).trim().slice(0,120))}if(!sets.length)throw err('No hay cambios');vals.push(Number(w[1]));await env.K17_DB.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=? AND role='worker'`).bind(...vals).run();return json({ok:true})}
  throw err('No encontrado',404);
 }catch(e){if(!e.status)console.error('K17 API internal error:',e?.message||String(e));return json({error:e.status?e.message:'Ocurrió un error al guardar la información'},e.status||500)}
}
