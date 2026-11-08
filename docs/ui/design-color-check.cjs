// 从当前原型源码复算语义颜色，输出本次检查证据。
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const source=fs.readFileSync(`${__dirname}/ui-directions.html`,'utf8');
const read=name=>vm.runInNewContext(`(${source.match(new RegExp(`const ${name}=({[\\s\\S]*?\\n});`))[1]})`);
const host=read('demoHostPalettes'),components=read('componentPalettes');
const rgb=hex=>{hex=hex.slice(1);if(hex.length===3)hex=hex.split('').map(x=>x+x).join('');return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)).concat(hex.length===8?parseInt(hex.slice(6,8),16)/255:1)};
const mix=(a,b,p)=>a.slice(0,3).map((v,i)=>v*p+b[i]*(1-p));
const over=(a,b)=>mix(a,b,a[3]??1);
const luminance=a=>a.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>{const x=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (x[0]+.05)/(x[1]+.05)};
const metrics=[];
for(const theme of ['dsh','fresh','warm'])for(const appearance of ['light','dark']){
 const [bg,surface,text,,,,,hover,,,,warn]=host[theme][appearance].map(rgb);
 const [panel,muted,primary,onPrimary,selected,selectedText,danger,focus,circle,line,thumbOff,thumbOn,success,warning]=components[theme][appearance].map(rgb);
 const backgrounds={bg,surface,panel,hover:over(hover,bg)};
 const ratios={primary:ratio(onPrimary,primary),selected:ratio(selectedText,selected),danger:ratio(danger,surface),switchOff:ratio(thumbOff,muted),switchOn:ratio(thumbOn,rgb(host[theme][appearance][5])),warningBanner:ratio(warning,rgb(host[theme][appearance][10])),panelOnBg:ratio(panel,bg)};
 for(const [name,b] of Object.entries(backgrounds)){
   ratios['bodyOn_'+name]=ratio(text,b);
   ratios['secondaryOn_'+name]=ratio(muted,b);
   ratios['focusOn_'+name]=ratio(focus,b);
   ratios['circleOn_'+name]=ratio(circle,b);
   ratios['controlLineOn_'+name]=ratio(line,b);
   ratios['successOn_'+name]=ratio(success,b);
   ratios['warningOn_'+name]=ratio(warning,b);
   ratios['listMetadataOn_'+name]=ratio(muted,b);
 }
 for(const [name,value] of Object.entries(ratios)){
   const threshold=/focusOn|circleOn|controlLineOn|switch/.test(name)?3:name==='panelOnBg'?0:4.5;
   assert.ok(value>=threshold,`${theme}/${appearance} ${name}=${value.toFixed(3)} < ${threshold}`);
 }
 metrics.push({theme,appearance,hostTokens:host[theme][appearance],componentTokens:components[theme][appearance],ratios});
 console.log(`通过：${theme}/${appearance} 实底对比度检查`);
}
const evidence={date:'2026-11-06',source:'docs/ui/ui-directions.html',sha256:crypto.createHash('sha256').update(source).digest('hex'),method:{space:'sRGB',luminance:'WCAG relative luminance',alpha:'先合成透明背景再计算亮度',thresholds:{normalText:4.5,essentialGraphics:3},limitations:'源码令牌计算；未运行浏览器，不代表整页合规。容器层次仅记录，不按文字阈值判断。'},metrics};
if(process.argv.includes('--write')){
 fs.mkdirSync(`${__dirname}/verification`,{recursive:true});
 fs.writeFileSync(`${__dirname}/verification/current-contrast-evidence.json`,JSON.stringify(evidence,null,2)+'\n');
}
console.log('六种外观颜色检查通过；范围为DSH、清爽与温暖阅读。');
