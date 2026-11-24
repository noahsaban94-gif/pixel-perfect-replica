import { useState } from 'react';
import { Plus, Minus, Info, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Product } from '@/lib/portal-domain';
import { usePortal } from './portal-context';
export function ProductCard({product,onInfo}:{product:Product;onInfo:(p:Product)=>void}){
 const p=usePortal(),[failed,setFailed]=useState(false),quantity=p.cart.find(l=>l.sku===product.sku)?.quantity??0;
 function change(delta:number){const next=Math.max(0,quantity+delta);p.setCart([...p.cart.filter(l=>l.sku!==product.sku),...(next?[{sku:product.sku,quantity:next}]:[])]);}
 return <article className="product-card"><div className="product-image">{failed?<Package size={45} className="text-muted-foreground"/>:<img src={product.image} alt={product.name} loading="lazy" onError={()=>setFailed(true)}/>} {product.deposit&&<span className="product-tag">פקדון משטח</span>}</div><div className="product-content"><div className="eyebrow">מק״ט {product.sku}</div><h3>{product.name}</h3><div className="product-meta"><span>{product.unit}</span><span>•</span><span>{product.weight} ק״ג ליחידה</span></div><div className="product-controls"><Button variant="ghost" className="technical-button" onClick={()=>onInfo(product)}><Info size={13}/>מידע טכני</Button>{quantity?<div className="quantity-control"><Button variant="outline" size="icon" aria-label={`הוסף ${product.name}`} onClick={()=>change(1)}><Plus/></Button><span>{quantity}</span><Button variant="outline" size="icon" aria-label={`הפחת ${product.name}`} onClick={()=>change(-1)}><Minus/></Button></div>:<Button size="sm" onClick={()=>change(1)}><Plus/>הוספה</Button>}</div></div></article>;
}