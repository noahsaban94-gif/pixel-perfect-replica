import { describe, it, expect } from 'vitest';
import { calculateOrder, matchesCustomer, NEW_CUSTOMER_ID, isCustomerProduct, phoneSchema, type Product, type Customer } from '@/lib/portal-domain';
const product:Product={sku:'10002',name:'מלט אפור',category:'מלט',unit:'שק',keywords:'',technical:'',deposit:'60060',weight:25,image:'',palletCapacity:null};
const customer:Customer={id:'123',name:'לקוח',phone:'0501234567',sites:[],preferredSite:'',exempt:false,linkedIds:['456']};
describe('Order rules',()=>{
 it('allocates one 60060 pallet per 40 sacks rounded up',()=>{expect(calculateOrder([{sku:'10002',quantity:41}],[product]).deposits).toEqual([{sku:'60060',name:'משטח סבן פקדון',quantity:2}]);});
 it('allocates 60002 deposits one to one',()=>{expect(calculateOrder([{sku:'10002',quantity:3}],[{...product,deposit:'60002'}]).deposits[0]?.quantity).toBe(3);});
 it('calculates block pallets using the product capacity',()=>{expect(calculateOrder([{sku:'10002',quantity:121}],[{...product,deposit:'60006',palletCapacity:60}]).deposits[0]?.quantity).toBe(3);});
 it('does not invent missing block capacity',()=>{expect(calculateOrder([{sku:'10002',quantity:10}],[{...product,deposit:'60006'}]).issues.length).toBe(1);});
 it('exempt customers get no deposits',()=>{expect(calculateOrder([{sku:'10002',quantity:41}],[product],true).deposits).toEqual([]);});
 it('calculates kg and tons',()=>{const totals=calculateOrder([{sku:'10002',quantity:40}],[product]);expect(totals.weight).toBe(1000);expect(totals.tons).toBe(1);});
 it('limits pickup to 1.5 tons',()=>{expect(calculateOrder([{sku:'10002',quantity:60}],[product]).truck).toBe('טנדר');expect(calculateOrder([{sku:'10002',quantity:61}],[product]).truck).toBe('מנוף בינוני');});
 it('limits medium crane to 8 tons',()=>{expect(calculateOrder([{sku:'10002',quantity:320}],[product]).truck).toBe('מנוף בינוני');expect(calculateOrder([{sku:'10002',quantity:321}],[product]).truck).toBe('מנוף כבד');});
 it('isolates records to primary and linked ids',()=>{expect(matchesCustomer('123',customer)).toBe(true);expect(matchesCustomer('456',customer)).toBe(true);expect(matchesCustomer('789',customer)).toBe(false);});
 it('never groups unrelated new customers under 500500',()=>{expect(NEW_CUSTOMER_ID).toBe('500500');expect(matchesCustomer('500500',{...customer,id:NEW_CUSTOMER_ID})).toBe(false);});
 it('removes internal administrative products',()=>{for(const n of ['הובלה מנוף','הובלות משאית','תוספת משטח מחולק','גלופה','מגורי עובדים','פריט ניסיון'])expect(isCustomerProduct(n)).toBe(false);expect(isCustomerProduct('מלט אפור')).toBe(true);});
 it('normalizes mobile phone numbers',()=>{expect(phoneSchema.parse('050-123 4567')).toBe('0501234567');expect(phoneSchema.parse('+972501234567')).toBe('0501234567');expect(phoneSchema.safeParse('123').success).toBe(false);});
});