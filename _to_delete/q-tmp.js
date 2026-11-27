const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();
(async()=>{const r=await p.$queryRawUnsafe(`select i.name,i.unit,count(*)::int sizes,min(p.cons_qty) mn,max(p.cons_qty) mx,count(p.quality_grade_id)::int branded from packing_consumptions p join inventory_items i on i.id=p.item_id where p.active group by 1,2 order by 1`);console.log(r);
const v=await p.$queryRawUnsafe(`select voucher_type,count(*)::int n from vouchers where status<>'VOID' group by 1`);console.log(v);
const l=await p.$queryRawUnsafe(`select v.voucher_no,i.name,l.qty_out from stock_ledger l join vouchers v on v.id=l.voucher_id join inventory_items i on i.id=l.item_id where l.item_type='STORE' and l.qty_out>0 order by l.id desc limit 10`);console.log(l);
process.exit(0)})().catch(e=>{console.log(e.message);process.exit(1)});
