const fs=require('fs'); 
const p=process.argv[2]; 
const s=parseInt(process.argv[3],10); 
const e=parseInt(process.argv[4],10); 
const l=fs.readFileSync(p,'utf8').split(/\r?\n/); 
