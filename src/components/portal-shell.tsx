import { Link, useLocation } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ClipboardList, FileCheck2, UserRound, Plus, Bell, ShieldCheck, Phone, ChevronLeft, LogOut, HardHat, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { usePortal } from './portal-context';
import { supabase } from '@/integrations/supabase/client';
import { phoneSchema } from '@/lib/portal-domain';
import { registerPortalWorker } from '@/lib/pwa';
import brand from '@/assets/saban-brand.jpg.asset.json';
const nav = [{to:'/',label:'הזמנה חדשה',Icon:Plus},{to:'/orders',label:'ההזמנות שלי',Icon:ClipboardList},{to:'/documents',label:'תעודות משלוח',Icon:FileCheck2},{to:'/profile',label:'הפרופיל שלי',Icon:UserRound}] as const;
export function PortalShell({children}:{children:ReactNode}) {
 const p=usePortal(),location=useLocation();
 useEffect(()=>{ void registerPortalWorker(); },[]);
 const links=nav.map(n=><Link key={n.to} to={n.to} className={`nav-link ${location.pathname===n.to?'active':''}`}><n.Icon size={19}/><span>{n.label}</span></Link>);
 return <div className="portal-layout" dir="rtl"><aside className="sidebar"><Link to="/" aria-label="ח. סבן חומרי בניין"><div className="brand-mark" aria-hidden="true"><i/><i/><i/></div><div className="brand-name">ח. סבן</div><div className="text-sm mt-2 font-medium">חומרי בניין <span className="text-primary">(1994)</span></div></Link><div className="sidebar-rule"/><div className="sidebar-caption mb-4">האיזור האישי שלך</div><nav>{links}</nav><div className="sidebar-bottom"><div className="flex gap-3 items-center mb-5"><HardHat size={28} className="text-primary"/><div><div className="text-sm font-semibold">בונים איתכם. מאז 1994.</div><div className="sidebar-caption mt-1">חומרים טובים. אנשים טובים.</div></div></div><div className="sidebar-rule"/><div className="flex items-center gap-2 sidebar-caption"><ShieldCheck size={15}/>פורטל לקוחות מאובטח</div><div className="sidebar-caption mt-4">ח. סבן חומרי בניין (1994) בע״מ</div></div></aside><header className="topbar"><div><div className="topbar-title">ח. סבן <span className="text-muted-foreground font-normal">/ פורטל לקוחות</span></div><div className="topbar-subtitle">כל מה שצריך לבנייה, במקום אחד.</div></div><div className="flex items-center gap-3"><Button variant="ghost" size="icon" aria-label="התראות" onClick={()=>p.setAuthOpen(true)}><Bell size={19}/></Button><div className="h-7 border-r border-border"/><Button variant="ghost" onClick={()=>p.setAuthOpen(true)}><UserRound size={18}/><span>{p.customer?.name || 'כניסה לחשבון'}</span><ChevronLeft size={14}/></Button></div></header>{children}<nav className="mobile-nav">{links}</nav><AuthDialog/></div>;
}
function AuthDialog(){
 const p=usePortal(),[phone,setPhone]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(){setError('');const result=phoneSchema.safeParse(phone);if(!result.success){setError('יש להזין מספר נייד תקין');return;}setBusy(true);try{
  const number=`+972${result.data.slice(1)}`;
  const response=sent?await supabase.auth.verifyOtp({phone:number,token:code,type:'sms'}):await supabase.auth.signInWithOtp({phone:number});
  if(response.error){setError('שליחת קוד האימות עדיין אינה זמינה. נדרש להגדיר שירות SMS לפני כניסת לקוחות.');return;}
  if(sent){await p.refresh();p.setAuthOpen(false);}else setSent(true);
 }finally{setBusy(false);}}
 return <Dialog open={p.authOpen} onOpenChange={p.setAuthOpen}><DialogContent dir="rtl"><img src={brand.url} alt="ח. סבן חומרי בניין (1994) בע״מ" className="brand-dialog"/><DialogTitle className="text-right">{p.signedIn?'החשבון שלך':'ברוכים הבאים לסבן'}</DialogTitle><DialogDescription className="text-right">{p.signedIn?'ניהול החשבון האישי שלך':'כניסה מאובטחת באמצעות קוד חד־פעמי לנייד'}</DialogDescription>{p.signedIn?<><p>{p.customer?.name || 'מספר טלפון מאומת'}</p><Button variant="outline" onClick={async()=>{await supabase.auth.signOut();await p.refresh();p.clear();p.setAuthOpen(false);}}><LogOut/>התנתקות</Button></>:<><label className="field-label" htmlFor="login-phone">מספר הטלפון שלך</label><Input id="login-phone" type="tel" dir="ltr" maxLength={16} placeholder="050-000-0000" value={phone} onChange={e=>setPhone(e.target.value)}/>{sent&&<Input aria-label="קוד אימות" dir="ltr" inputMode="numeric" maxLength={6} placeholder="קוד אימות" value={code} onChange={e=>setCode(e.target.value)}/>}<Button onClick={submit} disabled={busy || (sent&&code.length!==6)}>{busy?<LoaderCircle className="animate-spin"/>:<Phone/>}{sent?'אימות וכניסה':'שליחת קוד אימות'}</Button>{error&&<p className="input-error" role="alert">{error}</p>}<div className="notice"><ShieldCheck size={20}/><span>הפרטים והמסמכים שלך מוצגים רק לאחר אימות הנייד.</span></div></>}</DialogContent></Dialog>;
}