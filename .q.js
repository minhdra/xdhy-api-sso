require('dotenv').config({path: process.argv[2]});
const {Client}=require('pg');
(async()=>{const c=new Client({host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.argv[3]||process.env.DB_NAME});await c.connect();
const r=await c.query(process.argv[4]);console.log(r.rows.map(x=>Object.values(x).join(' | ')).join('\n'));await c.end();})().catch(e=>console.error(e.message));
