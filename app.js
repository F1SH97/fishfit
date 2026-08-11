/* ============================================================================
   PerformanceOS — standalone build (no framework, no build step)
   Ported from PerformanceOS-App.jsx. Charts are hand-drawn SVG.
   Fixture data shaped like Garmin MCP tool outputs; swap for real data later.
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------ helpers -------------------------------- */
  const pad2 = (n) => String(Math.round(n)).padStart(2, "0");
  const mmss = (s) => Math.floor(s / 60) + ":" + pad2(s % 60);
  const pace = mmss;
  const hm = (min) => Math.floor(min / 60) + "h " + Math.round(min % 60) + "m";
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const shortDate = (d) => d.getDate() + " " + MON[d.getMonth()];
  const epley = (w, r) => Math.round(w * (1 + r / 30));
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  function mulberry32(seed){return function(){seed|=0;seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
  function genSeries(o){const rnd=mulberry32(o.seed);const out=[];const today=new Date("2026-07-03T00:00:00");for(let i=0;i<o.n;i++){const base=o.start+(o.end-o.start)*(i/(o.n-1));let v=base+(rnd()*2-1)*o.noise;if(o.min!=null)v=Math.max(o.min,v);if(o.max!=null)v=Math.min(o.max,v);v=o.decimals?+v.toFixed(o.decimals):Math.round(v);const d=new Date(today);d.setDate(d.getDate()-(o.n-1-i)*(o.weekly?7:1));out.push({date:d,value:v});}return out;}
  function regression(v){const n=v.length;let sx=0,sy=0,sxy=0,sxx=0;v.forEach((y,x)=>{sx+=x;sy+=y;sxy+=x*y;sxx+=x*x;});const slope=(n*sxy-sx*sy)/(n*sxx-sx*sx||1);return{slope,intercept:(sy-slope*sx)/n};}
  function rolling(v,w){return v.map((_,i)=>{const s=Math.max(0,i-w+1);const sl=v.slice(s,i+1);return +(sl.reduce((a,b)=>a+b,0)/sl.length).toFixed(2);});}
  const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const ic = (name, px) => '<span class="ic" style="--s:' + (px||16) + 'px"><i data-lucide="' + name + '"></i></span>';

  /* ------------------------------ fixtures ------------------------------- */
  const RACE = { name:"Bridge to Brisbane", dist:"10 km", date:new Date("2026-09-13T07:00:00"), goalSec:3600 };
  const TODAY = new Date("2026-07-03T00:00:00"); // anchors the demo training-block schedule
  const daysTo = Math.max(0, Math.round((RACE.date - new Date()) / 86400000)); // live countdown to race day
  // Live-overridable race projection (seconds for 10 km) + confidence band; updated by applyLive().
  const PROJ = { k10: 3590, band: [3500, 3680] };
  // Weekly check-in destination. To point at a Claude Project later, change ONLY this
  // one value to your project URL (e.g. "https://claude.ai/project/<id>"); nothing else changes.
  const COACH_BASE = "https://claude.ai/new";
  const round2 = (v) => (typeof v === "number" && isFinite(v)) ? String(+v.toFixed(2)) : v;

  const SCORES = [
    {key:"performance",label:"Performance",value:74,src:"Garmin Training Status",accent:"warm",note:"Productive — VO\u2082max trending up over the block.",inputs:[["Training Status","Productive"],["VO\u2082max trend","+2 in 90d"],["Acute load","420 / balanced"]]},
    {key:"recovery",label:"Recovery",value:81,src:"HRV \u00b7 RHR \u00b7 Sleep",accent:"cool",note:"HRV in normal range, RHR low. You are recovered.",inputs:[["HRV vs baseline","62 ms \u00b7 normal"],["Resting HR","48 bpm"],["Sleep score","78"]]},
    {key:"readiness",label:"Readiness",value:76,src:"Garmin Training Readiness",accent:"cool",note:"Green to train. Body Battery recharged to 62 overnight.",inputs:[["Training Readiness","76 / High"],["Body Battery","62"],["Sleep debt","-0h20"]]},
    {key:"consistency",label:"Consistency",value:88,src:"Sessions vs plan \u00b7 4 wk",accent:"warm",note:"13 of 15 planned sessions hit. Streak holding.",inputs:[["Sessions completed","13 / 15"],["Weeks on plan","4 / 4"],["Long runs hit","4 / 4"]]}
  ];

  const METRICS = [
    {key:"vo2",label:"VO\u2082 Max",icon:"gauge",unit:"",value:"46",polarity:"up",chart:"line",group:"Fitness",gen:{start:44,end:46,noise:0.4,min:40,decimals:1,seed:11}},
    {key:"load",label:"Training Load",icon:"activity",unit:"",value:"420",polarity:"neutral",chart:"line",group:"Fitness",sub:"ACWR 1.12",gen:{start:340,end:420,noise:40,min:150,seed:66}},
    {key:"threshold",label:"Threshold Pace",icon:"zap",unit:"/km",value:"5:35",polarity:"down",chart:"line",group:"Fitness",isTime:true,gen:{start:345,end:335,noise:4,decimals:0,seed:133}},
    {key:"hrv",label:"HRV",icon:"heart-pulse",unit:"ms",value:"62",polarity:"up",chart:"line",group:"Recovery",gen:{start:58,end:62,noise:5,min:40,seed:22}},
    {key:"sleep",label:"Sleep Score",icon:"moon",unit:"",value:"78",polarity:"up",chart:"line",group:"Recovery",gen:{start:74,end:78,noise:8,min:40,max:100,seed:33}},
    {key:"rhr",label:"Resting HR",icon:"heart",unit:"bpm",value:"48",polarity:"down",chart:"line",group:"Recovery",gen:{start:52,end:48,noise:2,min:42,seed:44}},
    {key:"battery",label:"Body Battery",icon:"battery-charging",unit:"",value:"62",polarity:"up",chart:"line",group:"Recovery",gen:{start:60,end:62,noise:14,min:5,max:100,seed:55}},
    {key:"wdist",label:"Weekly Distance",icon:"route",unit:"km",value:"42",polarity:"up",chart:"bar",group:"Running",gen:{start:30,end:42,noise:5,min:12,weekly:true,seed:77}},
    {key:"wtime",label:"Weekly Time",icon:"timer",unit:"",value:"4h 10m",polarity:"up",chart:"bar",group:"Running",fmt:hm,gen:{start:180,end:250,noise:25,min:60,weekly:true,seed:88}},
    {key:"pb5",label:"5 km PB",icon:"trophy",unit:"",value:"28:50",polarity:"down",chart:"line",group:"Running",isTime:true,badge:"PB",gen:{start:1810,end:1730,noise:6,decimals:0,seed:111}},
    {key:"pb10",label:"10 km PB",icon:"trophy",unit:"",value:"61:38",polarity:"down",chart:"line",group:"Running",isTime:true,badge:"PB",gen:{start:3820,end:3698,noise:10,decimals:0,seed:122}},
    {key:"weight",label:"Current Weight",icon:"scale",unit:"kg",value:"74.5",polarity:"neutral",chart:"line",group:"Recovery",neutralCopy:true,gen:{start:75.6,end:74.5,noise:0.4,decimals:1,seed:99}},
    {key:"bench",label:"Bench 1RM",icon:"dumbbell",unit:"kg",value:"82",polarity:"up",chart:"line",group:"Strength",badge:"est.",gen:{start:77,end:82,noise:1.2,decimals:0,seed:144}},
    {key:"squat",label:"Squat 1RM",icon:"dumbbell",unit:"kg",value:"110",polarity:"up",chart:"line",group:"Strength",badge:"est.",gen:{start:100,end:110,noise:2,decimals:0,seed:155}},
    {key:"deadlift",label:"Deadlift 1RM",icon:"dumbbell",unit:"kg",value:"140",polarity:"up",chart:"line",group:"Strength",badge:"est.",gen:{start:130,end:140,noise:2.5,decimals:0,seed:166}}
  ];
  const byKey = (k) => METRICS.find((m) => m.key === k);

  const TRAJECTORY = [
    {wk:"W1",p:3702,lo:3660,hi:3744},{wk:"W2",p:3680,lo:3636,hi:3724},{wk:"W3",p:3655,lo:3608,hi:3702},
    {wk:"W4",p:3628,lo:3578,hi:3678},{wk:"W5",p:3606,lo:3552,hi:3660},{wk:"W6",p:3588,lo:3528,hi:3648},
    {wk:"W7",p:3572,lo:3508,hi:3636},{wk:"W8",p:3560,lo:3492,hi:3628},{wk:"W9",p:3552,lo:3480,hi:3624},
    {wk:"Race",p:3548,lo:3470,hi:3626}
  ];
  const EXECUTION = { score:86, parts:[["Workout completion",92],["Target compliance",84],["Recovery compliance",80],["Consistency",88]] };
  const AGENTS = [
    {name:"LoadCheck",icon:"activity",tone:"ok",ts:"2h ago",out:"Acute:chronic load 1.12 — inside the 0.8\u20131.3 sweet spot. Ramp is safe; hold the build."},
    {name:"Session Timing",icon:"clock",tone:"ok",ts:"2h ago",out:"HRV settled overnight (62 ms). Best quality window is this morning — run before 9am."},
    {name:"Recovery Read",icon:"heart-handshake",tone:"ok",ts:"6h ago",out:"Sleep 78, RHR 48, HRV normal. Fully recovered — no reason to hold back on the next threshold."},
    {name:"Easy Day Audit",icon:"wind",tone:"warn",ts:"1d ago",out:"Sunday's easy run drifted to Z3 (avg HR 148 vs 142 cap). Ease off — easy days protect the hard ones."},
    {name:"Race Predictor",icon:"flag",tone:"ok",ts:"3h ago",out:"Projected 10k 59:50 (58:20\u201361:20). On the right side of 60:00, but the margin is thin."},
    {name:"Monday Review",icon:"brain",tone:"idle",ts:"Runs Mon 6am",out:"Next automated weekly review scheduled. Will summarise load, recovery, injury risk and set the plan."}
  ];
  const RUNS = [
    {date:"Sun 29 Jun",type:"Long run",dist:13.2,paceSec:405,hr:148,tag:"Drifted to Z3 late"},
    {date:"Fri 27 Jun",type:"Easy",dist:5.1,paceSec:402,hr:138,tag:"Clean Z2"},
    {date:"Wed 25 Jun",type:"Threshold 3\u00d78",dist:9.4,paceSec:336,hr:168,tag:"Hit target pace"},
    {date:"Tue 24 Jun",type:"Easy",dist:6.0,paceSec:408,hr:136,tag:"Conversational"},
    {date:"Sun 22 Jun",type:"Long run",dist:12.5,paceSec:410,hr:145,tag:"Solid aerobic"}
  ];
  const INTENSITY = [ {name:"Easy (Z1\u20132)",value:79,color:"var(--cool)"},{name:"Threshold (Z3\u20134)",value:15,color:"var(--warm)"},{name:"VO\u2082 / hard (Z5)",value:6,color:"var(--coral)"} ];
  const INJURY = { flags:[ {label:"Acute:chronic ratio",value:"1.12",tone:"ok",note:"Balanced (0.8\u20131.3)"},{label:"Training monotony",value:"1.4",tone:"ok",note:"Varied enough"},{label:"Easy-day intensity",value:"creep",tone:"warn",note:"Z3 drift on easy runs"} ] };

  const PHASES = [
    {wk:"W1",date:"18 May",phase:"Build",quality:"Intervals"},{wk:"W2",date:"25 May",phase:"Build",quality:"Quality"},
    {wk:"W3",date:"1 Jun",phase:"Build",quality:"Intervals"},{wk:"W4",date:"8 Jun",phase:"Recovery",quality:"Quality"},
    {wk:"W5",date:"15 Jun",phase:"Build",quality:"Intervals"},{wk:"W6",date:"22 Jun",phase:"Build",quality:"Intervals"},
    {wk:"W7",date:"29 Jun",phase:"Build",quality:"6\u00d7800 @5:40\u20135:50"},{wk:"W8",date:"6 Jul",phase:"Build",quality:"Tempo 20\u2032"},
    {wk:"W9",date:"13 Jul",phase:"Build",quality:"8\u00d7400 @5:15\u20135:25"},{wk:"W10",date:"20 Jul",phase:"Recovery",quality:"Progression 8k"},
    {wk:"W11",date:"27 Jul",phase:"Build",quality:"3\u00d72km @5:45\u20135:50"},{wk:"W12",date:"3 Aug",phase:"Peak",quality:"5\u00d71km @5:50\u20135:55"},
    {wk:"W13",date:"10 Aug",phase:"Build",quality:"Tempo 25\u2032"},{wk:"W14",date:"17 Aug",phase:"Benchmark",quality:"5k time trial"},
    {wk:"W15",date:"24 Aug",phase:"Taper",quality:"4\u00d7400 @5k pace"},{wk:"W16",date:"31 Aug",phase:"Taper",quality:"Sharpen 6\u00d7400 @GP"},
    {wk:"W17",date:"7 Sep",phase:"Race",quality:"3\u00d7800 \u2192 race"}
  ];
  const CURRENT_WEEK = 7;
  const BLOCK_START = new Date("2026-05-18T00:00:00");
  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  const SPORT = {
    easy:{icon:"footprints",color:"var(--cool)"}, quality:{icon:"zap",color:"var(--warm)"},
    long:{icon:"footprints",color:"var(--coral)"}, strides:{icon:"footprints",color:"var(--cool)"},
    bike:{icon:"bike",color:"var(--bike)"}, push:{icon:"dumbbell",color:"var(--str)"},
    pull:{icon:"dumbbell",color:"var(--str)"}, legs:{icon:"dumbbell",color:"var(--str)"},
    mobility:{icon:"waves",color:"var(--muted)"}, rest:{icon:"bed",color:"var(--muted)"}
  };
  const HARD = ["quality","long","legs"];

  const WEEKS = [
    {ph:"Build",mon:{easy:"4 km"},q:{t:"Interval session",tg:"Quality reps"},long:{t:"Long run \u00b7 6 km"},fri:"recovery"},
    {ph:"Build",mon:{easy:"4.5 km"},q:{t:"Quality session",tg:"Controlled effort"},long:{t:"Long run \u00b7 5 km"},fri:"recovery"},
    {ph:"Build",mon:{easy:"5 km"},q:{t:"Interval session",tg:"Quality reps"},long:{t:"Long run \u00b7 8 km"},fri:"recovery"},
    {ph:"Recovery",mon:{easy:"4.5 km"},q:{t:"Quality session",tg:"Easy quality"},long:{t:"Long run \u00b7 6 km"},fri:"recovery"},
    {ph:"Build",mon:{cyc:"Zone 2 ride",easy:"5.5 km"},q:{t:"Interval session",tg:"Quality reps"},long:{t:"Long run \u00b7 7 km"},fri:"recovery"},
    {ph:"Build",mon:{cyc:"Zone 2 ride \u00b7 45 min",easy:"5 km"},q:{t:"Interval session",tg:"Quality reps"},long:{t:"Long run \u00b7 8 km"},fri:"bike"},
    {ph:"Build",mon:{cyc:"Zone 2 ride \u00b7 45 min",easy:"5 km",str:true},q:{t:"6 \u00d7 800 m",tg:"5:40\u20135:50/km \u00b7 2\u2032 jog",key:true},long:{t:"Long run \u00b7 9 km",tg:"Last 2 km @ goal pace if good"},fri:"bike-mob"},
    {ph:"Build",mon:{cyc:"Zone 2 ride \u00b7 45 min",easy:"5.5 km"},q:{t:"Tempo \u00b7 20 min",tg:"5:55\u20136:05/km"},long:{t:"Long run \u00b7 10 km"},fri:"bike"},
    {ph:"Build",mon:{cyc:"Zone 2 ride \u00b7 45\u201360 min",easy:"6 km"},q:{t:"8 \u00d7 400 m",tg:"5:15\u20135:25/km"},long:{t:"Long run \u00b7 11 km"},fri:"bike"},
    {ph:"Recovery",mon:{cyc:"Zone 2 ride \u00b7 40 min",easy:"5 km"},q:{t:"Progression run \u00b7 8 km",tg:"Build to goal pace"},long:{t:"Long run \u00b7 9 km"},fri:"bike",thu:"Legs \u00b7 reduced volume"},
    {ph:"Build",mon:{cyc:"Zone 2 ride \u00b7 45\u201360 min",easy:"6 km"},q:{t:"3 \u00d7 2 km",tg:"5:45\u20135:50/km"},long:{t:"Long run \u00b7 12 km",tg:"Final 3 km @ goal pace"},fri:"bike"},
    {ph:"Peak",mon:{cyc:"Zone 2 ride \u00b7 60 min",easy:"6 km"},q:{t:"5 \u00d7 1 km",tg:"5:50\u20135:55/km"},long:{t:"Long run \u00b7 13 km",tg:"Final 3 km @ goal pace"},fri:"bike"},
    {ph:"Build",mon:{cyc:"Zone 2 ride \u00b7 60 min",easy:"6 km"},q:{t:"Tempo \u00b7 25 min",tg:"Sustained effort"},long:{t:"Long run \u00b7 12 km"},fri:"bike"},
    {ph:"Benchmark",mon:{cyc:"Zone 2 ride \u00b7 45 min",easy:"5 km"},q:{t:"5 km benchmark TT",tg:"Controlled — calibration",key:true},long:{t:"Long run \u00b7 10 km",tg:"Middle 5 km @ goal pace"},fri:"bike",thu:"Legs \u00b7 light"},
    {ph:"Taper",mon:{cyc:"Zone 2 ride \u00b7 40 min",easy:"5 km"},q:{t:"4 \u00d7 400 m",tg:"5k pace \u00b7 full recovery"},long:{t:"Easy long run \u00b7 8 km"},fri:"bike",tue:"Push \u00b7 reduced",thu:"Legs \u00b7 activation only"},
    {ph:"Taper",mon:{cyc:"Zone 2 ride \u00b7 40 min",easy:"5 km"},q:{t:"6 \u00d7 400 m",tg:"Goal pace \u00b7 sharp & short"},long:{t:"Easy long run \u00b7 9 km",tg:"Middle 3 km @ goal pace"},fri:"bike",tue:"Push \u00b7 reduced",thu:"Legs \u00b7 activation only"},
    {ph:"Race",mon:{cyc:"Zone 2 ride \u00b7 30 min",easy:"4 km",str:true},q:{t:"3 \u00d7 800 m",tg:"Goal pace 5:58\u20136:00/km",key:true},long:{t:"Shake-out \u00b7 20 min",tg:"+ 4 strides"},fri:"bike",tue:"Push \u00b7 light",thu:"Legs \u00b7 mobility only",race:true}
  ];
  function statusFor(dt, kind){ if(kind==="rest") return "rest"; const t=dt.getTime(), n=TODAY.getTime(); return t<n?"done":t===n?"today":"upcoming"; }
  function buildWeek(spec, n){
    const mon0 = addDays(BLOCK_START, (n-1)*7); const D = {};
    DAYS.forEach((d,di)=>{ D[d]={date:shortDate(addDays(mon0,di)), sessions:[]}; });
    const dt=(di)=>addDays(mon0,di);
    const mk=(day,di,kind,title,target,comp,extra)=>{ const s=Object.assign({id:"w"+n+"-"+day+"-"+D[day].sessions.length,kind:kind,title:title,target:target,comp:comp,status:statusFor(dt(di),kind)}, extra||{}); D[day].sessions.push(s); };
    if(spec.mon.cyc) mk("Mon",0,"bike",spec.mon.cyc,"HR 135\u2013150","hr");
    if(spec.mon.easy) mk("Mon",0,"easy","Easy run \u00b7 "+spec.mon.easy,"HR 140\u2013155","hr");
    if(spec.mon.str) mk("Mon",0,"strides","4 \u00d7 20 sec strides","Relaxed speed","none");
    mk("Tue",1,"push",spec.tue?("Strength \u00b7 "+spec.tue):"Strength \u00b7 Push","Maintain \u00b7 low soreness","load");
    mk("Wed",2,"pull","Strength \u00b7 Pull","Maintain \u00b7 low soreness","load");
    mk("Wed",2,"quality",spec.q.t,spec.q.tg||"Quality effort","pace",spec.q.key?{keystone:true}:null);
    mk("Thu",3,"legs",spec.thu?("Strength \u00b7 "+spec.thu):"Strength \u00b7 Legs","Challenging \u00b7 avoid deep soreness","load");
    if(spec.fri==="recovery") mk("Fri",4,"mobility","Recovery & mobility","Loosen up","none");
    else if(spec.fri==="bike-mob"){ mk("Fri",4,"bike","Zone 2 ride","HR 135\u2013150","hr"); mk("Fri",4,"mobility","Mobility & recovery","Loosen up","none"); }
    else mk("Fri",4,"bike","Zone 2 ride","HR 135\u2013150","hr");
    mk("Sat",5,"long",spec.long.t,spec.long.tg||"Aerobic \u00b7 easy",spec.long.tg?"pace":"hr",spec.long.key?{keystone:true}:null);
    if(spec.race) mk("Sun",6,"long","\ud83c\udfc3 Bridge to Brisbane \u00b7 10 km","Sub-60 \u00b7 5:58\u20136:00/km","pace",{keystone:true});
    else mk("Sun",6,"rest","Rest","Full recovery","none");
    return D;
  }
  function buildSchedule(){ const s={}; WEEKS.forEach((spec,i)=>{ s[i+1]=buildWeek(spec,i+1); }); return s; }
  const WEEK_RANGE = (n) => shortDate(addDays(BLOCK_START,(n-1)*7)) + " \u2013 " + shortDate(addDays(BLOCK_START,(n-1)*7+6));
  function guardrails(week){ const out=[]; for(let i=0;i<DAYS.length-1;i++){ const a=week[DAYS[i]].sessions.some((s)=>HARD.indexOf(s.kind)>=0); const b=week[DAYS[i+1]].sessions.some((s)=>HARD.indexOf(s.kind)>=0); if(a&&b) out.push(DAYS[i]+" and "+DAYS[i+1]+" are back-to-back hard days — 48h between hard efforts is the target."); } return out; }

  const PUSH_SETS = [
    {name:"Barbell Bench Press",src:"garmin",sets:[[60,8],[65,6],[70,5]],main:true},
    {name:"Overhead Press",src:"garmin",sets:[[40,8],[42.5,6]]},
    {name:"Incline DB Press",src:"garmin",flag:"auto-detected \u00b7 check name",sets:[[24,10],[26,8]]},
    {name:"Cable Fly",src:"garmin",sets:[[15,12],[15,12],[15,11]]},
    {name:"Triceps Pushdown",src:"manual",sets:[[27.5,12],[27.5,10]]}
  ];
  const ATTRIBUTION = [
    {block:"Weeks 1\u20136 \u00b7 Base",delta:-80,why:"Aerobic base from long runs and easy volume — VO\u2082max 44 \u2192 45.5."},
    {block:"Week 7 \u00b7 Threshold (6\u00d7800)",delta:-14,why:"First goal-pace-minus reps nudged your threshold pace down."},
    {block:"Zone 2 cycling support",delta:-9,why:"Extra aerobic load without the running impact."},
    {block:"Strength maintenance",delta:-3,why:"Held running economy and power through the block."}
  ];

  /* ------------------------------- state --------------------------------- */
  // Which profile is being viewed. From ?u=<id>, sanitised to a safe slug so it
  // can never escape the data/<profile>/ folder. Defaults to "cjf".
  const PROFILE = ((new URLSearchParams(location.search).get("u") || "cjf")
    .toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32)) || "cjf";

  const state = {
    view:"Dashboard",
    modal:null,            // {type:'metric', key, win} | {type:'score',key} | {type:'goal'} | {type:'session', id}
    live:null,             // set to {syncedAt, source} once live Garmin data is applied
    profile:PROFILE,       // active profile id
    profileName:PROFILE,   // display name, filled from data/profiles.json
    week:CURRENT_WEEK,
    schedule:buildSchedule(),
    oneRM:{ bench:{v:82,src:"est",date:"2 Jul"}, squat:{v:110,src:"est",date:"28 Jun"}, deadlift:{v:140,src:"est",date:"25 Jun"} }
  };
  const effMetric = (m) => state.oneRM[m.key] ? Object.assign({}, m, {value:String(state.oneRM[m.key].v), badge:state.oneRM[m.key].src==="manual"?"manual":"est."}) : m;

  /* --------------------------- SVG chart helpers ------------------------- */
  function niceDomain(vals){ let mn=Math.min.apply(null,vals), mx=Math.max.apply(null,vals); if(mn===mx){mn-=1;mx+=1;} const pad=(mx-mn)*0.08; return [mn-pad, mx+pad]; }
  function polyline(pts, stroke, width, dash){ return '<polyline points="'+pts+'" fill="none" stroke="'+stroke+'" stroke-width="'+width+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>'; }

  function lineChart(rows, opts){
    const W=580,H=220,pL=46,pR=10,pT=10,pB=22; opts=opts||{};
    const keys=["value"].concat(opts.avg?["avg"]:[]).concat(opts.trend?["trend"]:[]);
    let all=[]; rows.forEach(r=>keys.forEach(k=>{ if(r[k]!=null) all.push(r[k]); }));
    const dom=niceDomain(all); const n=rows.length;
    const x=(i)=> pL + (W-pL-pR)*(n<2?0:(i/(n-1)));
    const y=(v)=> pT + (H-pT-pB)*(1-(v-dom[0])/((dom[1]-dom[0])||1));
    const fmtY=opts.fmtY||round2;
    let g="";
    for(let t=0;t<=3;t++){ const v=dom[0]+(dom[1]-dom[0])*t/3; const yy=y(v); g+='<line x1="'+pL+'" y1="'+yy+'" x2="'+(W-pR)+'" y2="'+yy+'" stroke="var(--line)" stroke-width="1"/>'; g+='<text class="cx" x="'+(pL-6)+'" y="'+(yy+3)+'" text-anchor="end">'+fmtY(v)+'</text>'; }
    let xl=""; const step=Math.max(1,Math.round(n/6));
    for(let i=0;i<n;i+=step){ xl+='<text class="cx" x="'+x(i)+'" y="'+(H-6)+'" text-anchor="middle">'+esc(rows[i].label)+'</text>'; }
    const line=(k,st,w,d)=> polyline(rows.map((r,i)=> r[k]==null?"":(x(i)+","+y(r[k]))).filter(Boolean).join(" "), st, w, d);
    let series="";
    if(opts.trend) series+=line("trend","var(--muted)",1.2,"5 4");
    if(opts.avg) series+=line("avg","var(--cool)",1.6);
    series+=line("value","var(--warm)",2.2);
    return svgWrap(W,H, g+xl+series);
  }
  function barChart(rows, opts){
    const W=580,H=220,pL=46,pR=10,pT=10,pB=22; opts=opts||{};
    let all=rows.map(r=>r.value); if(opts.avg) rows.forEach(r=>all.push(r.avg));
    const dom=[0, Math.max.apply(null,all)*1.1]; const n=rows.length;
    const x=(i)=> pL + (W-pL-pR)*(n<2?0.5:(i/(n-1)));
    const y=(v)=> pT + (H-pT-pB)*(1-(v-dom[0])/((dom[1]-dom[0])||1));
    const fmtY=opts.fmtY||round2;
    let g="";
    for(let t=0;t<=3;t++){ const v=dom[0]+(dom[1]-dom[0])*t/3; const yy=y(v); g+='<line x1="'+pL+'" y1="'+yy+'" x2="'+(W-pR)+'" y2="'+yy+'" stroke="var(--line)" stroke-width="1"/>'; g+='<text class="cx" x="'+(pL-6)+'" y="'+(yy+3)+'" text-anchor="end">'+fmtY(v)+'</text>'; }
    const bw=Math.max(4,(W-pL-pR)/n*0.6);
    let bars=""; rows.forEach((r,i)=>{ const yy=y(r.value); bars+='<rect x="'+(x(i)-bw/2)+'" y="'+yy+'" width="'+bw+'" height="'+(H-pB-yy)+'" rx="3" fill="var(--warm)"/>'; });
    let xl=""; const step=Math.max(1,Math.round(n/6));
    for(let i=0;i<n;i+=step){ xl+='<text class="cx" x="'+x(i)+'" y="'+(H-6)+'" text-anchor="middle">'+esc(rows[i].label)+'</text>'; }
    let avg=""; if(opts.avg) avg=polyline(rows.map((r,i)=>x(i)+","+y(r.avg)).join(" "),"var(--cool)",2);
    return svgWrap(W,H, g+bars+xl+avg);
  }
  function trajectoryChart(){
    const W=560,H=200,pL=46,pR=10,pT=8,pB=20; const d=TRAJECTORY; const n=d.length;
    let mn=Math.min.apply(null,d.map(r=>r.lo).concat([RACE.goalSec]));
    let mx=Math.max.apply(null,d.map(r=>r.hi).concat([RACE.goalSec]));
    const pad=(mx-mn)*0.10||30; const dom=[mn-pad, mx+pad];
    const x=(i)=> pL + (W-pL-pR)*(i/(n-1));
    const y=(v)=> pT + (H-pT-pB)*(1-(v-dom[0])/(dom[1]-dom[0]));
    let g=""; for(let t=0;t<=3;t++){ const v=dom[0]+(dom[1]-dom[0])*t/3; const yy=y(v); g+='<line x1="'+pL+'" y1="'+yy+'" x2="'+(W-pR)+'" y2="'+yy+'" stroke="var(--line)"/>'; g+='<text class="cx" x="'+(pL-6)+'" y="'+(yy+3)+'" text-anchor="end">'+mmss(v)+'</text>'; }
    const up=d.map((r,i)=>x(i)+","+y(r.hi)); const lo=d.map((r,i)=>x(i)+","+y(r.lo)).reverse();
    const band='<polygon points="'+up.concat(lo).join(" ")+'" fill="var(--warm)" fill-opacity="0.14"/>';
    const line=polyline(d.map((r,i)=>x(i)+","+y(r.p)).join(" "),"var(--warm)",2.4);
    const goalY=y(RACE.goalSec);
    const goal='<line x1="'+pL+'" y1="'+goalY+'" x2="'+(W-pR)+'" y2="'+goalY+'" stroke="var(--good)" stroke-dasharray="5 4"/><text class="cx" x="'+(W-pR)+'" y="'+(goalY-4)+'" text-anchor="end" fill="var(--good)">sub-60</text>';
    let xl=""; d.forEach((r,i)=>{ xl+='<text class="cx" x="'+x(i)+'" y="'+(H-5)+'" text-anchor="middle">'+esc(r.wk)+'</text>'; });
    return svgWrap(W,H, g+band+line+goal+xl);
  }
  function pieChart(data){
    const cx=75,cy=75,r=62,ir=40; let a=-Math.PI/2; let out="";
    const total=data.reduce((s,d)=>s+d.value,0);
    data.forEach(d=>{ const ang=d.value/total*Math.PI*2; const a2=a+ang;
      const x1=cx+r*Math.cos(a),y1=cy+r*Math.sin(a),x2=cx+r*Math.cos(a2),y2=cy+r*Math.sin(a2);
      const xi1=cx+ir*Math.cos(a2),yi1=cy+ir*Math.sin(a2),xi2=cx+ir*Math.cos(a),yi2=cy+ir*Math.sin(a);
      const large=ang>Math.PI?1:0;
      out+='<path d="M'+x1+','+y1+' A'+r+','+r+' 0 '+large+' 1 '+x2+','+y2+' L'+xi1+','+yi1+' A'+ir+','+ir+' 0 '+large+' 0 '+xi2+','+yi2+' Z" fill="'+d.color+'"/>';
      a=a2;
    });
    return '<svg viewBox="0 0 150 150" style="width:150px;height:150px">'+out+'</svg>';
  }
  function paceChart(){
    const rows=RUNS.slice().reverse(); const W=580,H=210,pL=46,pR=10,pT=10,pB=22;
    const vals=rows.map(r=>r.paceSec); const dom=niceDomain(vals.concat([335]));
    const n=rows.length; const x=(i)=> pL+(W-pL-pR)*(n<2?0.5:i/(n-1));
    const y=(v)=> pT+(H-pT-pB)*((v-dom[0])/((dom[1]-dom[0])||1)); // not inverted: higher pace(sec)=slower=lower on chart? keep slower at top
    const yy=(v)=> pT+(H-pT-pB)*(1-(v-dom[0])/((dom[1]-dom[0])||1));
    let g=""; for(let t=0;t<=3;t++){ const v=dom[0]+(dom[1]-dom[0])*t/3; const gy=yy(v); g+='<line x1="'+pL+'" y1="'+gy+'" x2="'+(W-pR)+'" y2="'+gy+'" stroke="var(--line)"/>'; g+='<text class="cx" x="'+(pL-6)+'" y="'+(gy+3)+'" text-anchor="end">'+mmss(v)+'</text>'; }
    const thY=yy(335); g+='<line x1="'+pL+'" y1="'+thY+'" x2="'+(W-pR)+'" y2="'+thY+'" stroke="var(--cool)" stroke-dasharray="4 4"/><text class="cx" x="'+(pL+4)+'" y="'+(thY-4)+'" fill="var(--cool)">threshold 5:35</text>';
    const line=polyline(rows.map((r,i)=>x(i)+","+yy(r.paceSec)).join(" "),"var(--warm)",2.4);
    let dots=""; rows.forEach((r,i)=>{ dots+='<circle cx="'+x(i)+'" cy="'+yy(r.paceSec)+'" r="3" fill="var(--warm)"/>'; });
    let xl=""; rows.forEach((r,i)=>{ xl+='<text class="cx" x="'+x(i)+'" y="'+(H-6)+'" text-anchor="middle">'+esc(r.date.split(" ").slice(0,2).join(" "))+'</text>'; });
    return svgWrap(W,H,g+line+dots+xl);
  }
  function ringSVG(value){ const r=30,c=2*Math.PI*r; return '<svg width="78" height="78" viewBox="0 0 78 78"><g transform="rotate(-90 39 39)"><circle cx="39" cy="39" r="'+r+'" stroke="var(--track)" stroke-width="7" fill="none"/><circle cx="39" cy="39" r="'+r+'" stroke="var(--warm)" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="'+c+'" stroke-dashoffset="'+(c*(1-value/100))+'"/></g><text x="39" y="45" text-anchor="middle" class="num" font-size="22" fill="var(--text)">'+value+'</text></svg>'; }
  function svgWrap(W,H,inner){ return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:100%" preserveAspectRatio="none"><style>.cx{fill:var(--muted);font-size:10px;font-family:var(--font-b)}</style>'+inner+'</svg>'; }

  /* ----------------------------- components ------------------------------ */
  function section(title, hint, inner){ return '<section><div class="sec-head"><h3>'+title+'</h3>'+(hint?'<span class="sec-hint">'+hint+'</span>':'')+'</div>'+inner+'</section>'; }
  function cardHead(icon, title, sub, right){ return '<div class="card-head"><div><span class="card-title">'+ic(icon,16)+' '+title+'</span>'+(sub?'<div class="card-sub">'+sub+'</div>':'')+'</div>'+(right||'')+'</div>'; }

  function metricCard(m0){
    const m=effMetric(m0);
    return '<button class="pcard lift" data-action="metric" data-key="'+m.key+'" style="text-align:left;padding:15px;display:flex;flex-direction:column;gap:10px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center">'
      +'<span style="display:inline-flex;align-items:center;gap:8px;color:var(--dim);font-size:12px;font-weight:600">'+ic(m.icon,15)+' '+m.label+'</span>'
      +'<span style="display:inline-flex;gap:6px;align-items:center">'+(m.badge?'<em class="badge" style="font-style:normal">'+m.badge+'</em>':'')+'<span style="width:6px;height:6px;border-radius:6px;background:var(--cool);display:inline-block"></span></span>'
      +'</div>'
      +'<div style="display:flex;align-items:baseline;gap:6px"><span class="num" style="font-size:26px;font-weight:600;color:var(--text)">'+m.value+'</span><span style="color:var(--muted);font-size:12px">'+m.unit+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;color:var(--muted)">'+(m.sub||"90-day trend")+'</span>'+ic("chevron-right",15)+'</div></button>';
  }
  function metricGrid(keys){ return '<div class="gridM">'+keys.map(k=>metricCard(byKey(k))).join("")+'</div>'; }
  function scoreCard(s){
    const accent=s.accent==="warm"?"var(--warm)":"var(--cool)";
    return '<button class="pcard lift" data-action="score" data-key="'+s.key+'" style="text-align:left;padding:18px;display:flex;flex-direction:column;gap:10px;min-height:138px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:12.5px;color:var(--dim);font-weight:600">'+s.label+'</span><span style="font-size:10.5px;color:var(--muted)">'+s.src+'</span></div>'
      +'<div style="display:flex;align-items:baseline;gap:8px"><span class="num" style="font-size:42px;font-weight:600;color:var(--text);line-height:1">'+s.value+'</span><span style="color:var(--muted);font-size:13px">/100</span></div>'
      +'<div style="height:4px;border-radius:4px;background:var(--track);overflow:hidden"><div style="width:'+s.value+'%;height:100%;background:'+accent+';border-radius:4px"></div></div>'
      +'<span style="font-size:11.5px;color:var(--dim);line-height:1.35">'+s.note+'</span></button>';
  }
  function goalHero(clickable){
    const proj=PROJ.k10, onTrack=proj<RACE.goalSec;
    return '<div class="pcard hero-card'+(clickable?' lift':'')+'"'+(clickable?' data-action="goal"':'')+' style="padding:20px;display:grid;grid-template-columns:1.1fr 1.4fr;gap:22px'+(clickable?';cursor:pointer':'')+'">'
      +'<div style="display:flex;flex-direction:column;justify-content:space-between">'
        +'<div><div style="display:flex;justify-content:space-between;align-items:center"><span style="display:inline-flex;align-items:center;gap:8px;color:var(--warm);font-size:12px;font-weight:600">'+ic("sunrise",15)+' RACE GOAL</span>'+(clickable?'<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)">'+ic("maximize-2",12)+' tap to explore</span>':'')+'</div>'
        +'<h2 style="margin:8px 0 2px;font-size:22px;font-weight:600;color:var(--text)">'+RACE.name+'</h2>'
        +'<span style="color:var(--muted);font-size:13px">'+RACE.dist+' \u00b7 '+shortDate(RACE.date)+' 2026 \u00b7 target sub-'+mmss(RACE.goalSec)+'</span></div>'
        +'<div style="display:flex;gap:24px;margin-top:16px">'+stat(daysTo,"days out")+stat(mmss(proj),"projected",onTrack?"var(--good)":"var(--warn)")+stat("+"+mmss(RACE.goalSec-proj),"margin","var(--good)")+'</div>'
        +'<div class="chip" style="margin-top:16px;align-self:flex-start;background:rgba(100,224,163,0.12);color:var(--good);border:1px solid rgba(100,224,163,0.3)">'+ic("check-circle-2",14)+' On track — margin is thin, hold the sharpening block</div>'
      +'</div>'
      +'<div><span style="font-size:11.5px;color:var(--muted)">Projected 10 km time across the block (band = confidence range)</span><div style="height:184px;margin-top:6px">'+trajectoryChart()+'</div></div>'
    +'</div>';
  }
  function stat(big,label,accent){ return '<div><div class="num" style="font-size:26px;font-weight:600;color:'+(accent||"var(--text)")+';line-height:1">'+big+'</div><div style="font-size:11px;color:var(--muted);margin-top:4px">'+label+'</div></div>'; }

  function injuryCard(){
    return '<div class="pcard" style="padding:18px">'+cardHead("shield-alert","Injury risk","Load-based flags — not medical advice")
      +'<div style="margin:10px 0 14px"><span class="chip" style="background:rgba(100,224,163,0.12);color:var(--good);border:1px solid rgba(100,224,163,0.3)">'+ic("shield-alert",13)+' Overall: Low \u00b7 1 watch item</span></div>'
      +'<div class="gridM">'+INJURY.flags.map(f=>'<div class="pcard" style="padding:13px;background:var(--panel2)"><div style="font-size:11.5px;color:var(--muted)">'+f.label+'</div><div style="margin:4px 0"><span class="num" style="font-size:20px;font-weight:600;color:'+(f.tone==="warn"?"var(--warn)":"var(--good)")+'">'+f.value+'</span></div><div style="font-size:11.5px;color:var(--dim)">'+f.note+'</div></div>').join("")+'</div></div>';
  }

  /* ------------------------------- views --------------------------------- */
  function dashboardView(){
    return '<div class="stack">'
      +goalHero(true)
      +section("Scores","Wrapping Garmin native metrics",'<div class="grid4">'+SCORES.map(scoreCard).join("")+'</div>')
      +section("Key metrics","Tap any card for 7 / 30 / 90 / 365-day trends",metricGrid(["vo2","hrv","sleep","rhr","wdist","threshold"]))
      +section("Records & strength","Personal bests and one-rep maxes",metricGrid(["pb5","pb10","bench","squat","deadlift"]))
    +'</div>';
  }
  function performanceView(){
    return '<div class="stack">'+goalHero(true)
      +section("Fitness","",metricGrid(["vo2","load","threshold"]))
      +section("Running records","",metricGrid(["pb5","pb10","wdist","wtime"]))+'</div>';
  }
  function recoveryView(){
    return '<div class="stack">'+section("Recovery metrics","HRV, sleep, resting HR and Body Battery drive readiness",metricGrid(["hrv","sleep","rhr","battery","weight"]))+injuryCard()+'</div>';
  }
  function runningView(){
    const predictor='<div class="pcard" style="padding:18px">'+cardHead("flag","Race predictor","Blended model \u00b7 updates with each run")
      +'<div style="display:flex;align-items:baseline;gap:12px;margin:14px 0 6px"><span class="num" style="font-size:40px;font-weight:600;color:var(--good)">'+mmss(PROJ.k10)+'</span><span style="color:var(--muted);font-size:13px">projected 10 km</span></div>'
      +'<div style="font-size:12.5px;color:var(--dim)">Confidence range <b style="color:var(--text)">'+mmss(PROJ.band[0])+' \u2013 '+mmss(PROJ.band[1])+'</b></div>'
      +'<div style="height:8px;background:var(--track);border-radius:8px;margin:12px 0;position:relative"><div style="position:absolute;left:18%;right:34%;top:0;bottom:0;background:var(--warm);opacity:.4;border-radius:8px"></div><div style="position:absolute;left:42%;top:-3px;width:3px;height:14px;background:var(--text);border-radius:3px"></div><div style="position:absolute;left:50%;top:-3px;width:2px;height:14px;background:var(--good)"></div></div>'
      +'<div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted)"><span>57:00</span><span style="color:var(--good)">60:00 goal</span><span>63:00</span></div>'
      +'<p style="font-size:11.5px;color:var(--muted);margin-top:12px;line-height:1.5">Riegel projection from your 5k PB blended with a VO\u2082max estimate. The band tightens after your Week 14 benchmark 5k.</p></div>';
    const pie='<div class="pcard" style="padding:18px">'+cardHead("activity","Intensity distribution","Last 28 days \u00b7 target 80/20")
      +'<div style="display:flex;align-items:center;gap:18px;margin-top:8px"><div style="width:150px;height:150px">'+pieChart(INTENSITY)+'</div><div style="flex:1">'
      +INTENSITY.map(e=>'<div style="display:flex;align-items:center;gap:8px;margin-bottom:9px;font-size:12.5px"><span style="width:9px;height:9px;border-radius:9px;background:'+e.color+'"></span><span style="color:var(--dim);flex:1">'+e.name+'</span><span style="color:var(--text);font-weight:600">'+e.value+'%</span></div>').join("")
      +'<p style="font-size:11px;color:var(--good);margin-top:6px">79/21 split — right on the polarized target.</p></div></div></div>';
    const paceCard='<div class="pcard" style="padding:18px">'+cardHead("trending-down","Pace & threshold","Recent runs \u00b7 lower is faster")+'<div style="height:210px;margin-top:12px">'+paceChart()+'</div></div>';
    const table='<div class="pcard tbl-card" style="padding:4px"><table><thead><tr>'+["Date","Session","Dist","Pace","Avg HR","Note"].map(h=>'<th>'+h+'</th>').join("")+'</tr></thead><tbody>'
      +RUNS.map(r=>'<tr><td style="color:var(--dim)">'+r.date+'</td><td style="color:var(--text);font-weight:500">'+r.type+'</td><td class="num" style="color:var(--dim)">'+r.dist+' km</td><td class="num" style="color:var(--text)">'+pace(r.paceSec)+'/km</td><td class="num" style="color:var(--dim)">'+r.hr+'</td><td style="color:var(--muted);font-size:11.5px">'+r.tag+'</td></tr>').join("")+'</tbody></table></div>';
    return '<div class="stack"><div class="coach-grid">'+predictor+pie+'</div>'+paceCard+section("Recent runs","",table)+'</div>';
  }
  function strengthView(){
    const editor='<div class="pcard" style="padding:18px">'+cardHead("pencil","Enter or override your 1RM","Type a tested max, or estimate from a working set (Epley). Saved values are tagged manual.")
      +'<div style="margin-top:6px">'+["bench","squat","deadlift"].map(oneRMRow).join("")+'</div>'
      +'<p style="font-size:10.5px;color:var(--muted);margin-top:12px;line-height:1.45">A manual value overrides the Garmin-estimated 1RM until you log a heavier set, and updates the 1RM cards here and on your Dashboard.</p></div>';
    const capture='<div class="pcard" style="padding:18px">'+cardHead("dumbbell","Session capture","Exercises & weights read from Garmin — edit or backfill manually",'<button class="btn-ghost" data-action="session" data-id="push-demo">'+ic("line-chart",13)+' View last Push session</button>')
      +'<p style="font-size:12.5px;color:var(--dim);line-height:1.5;margin-top:12px;margin-bottom:0">Log your Push / Pull / Legs sessions with the Garmin Strength activity and PerformanceOS pulls every exercise, set, rep and weight — then estimates 1RM from your top sets. Prefer to set it yourself? Enter a tested max directly in the panel above.</p></div>';
    return '<div class="stack">'+section("One-rep max","Estimated from your Garmin sets — or enter your own tested max below",metricGrid(["bench","squat","deadlift"]))+editor+capture+'</div>';
  }
  function oneRMRow(lift){
    const labels={bench:"Bench Press",squat:"Back Squat",deadlift:"Deadlift"}; const d=state.oneRM[lift];
    return '<div style="padding:12px 0;border-bottom:1px solid var(--line)" data-lift="'+lift+'">'
      +'<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="display:inline-flex;align-items:center;gap:8px;min-width:150px;font-size:13px;font-weight:600;color:var(--text)">'+ic("dumbbell",15)+' '+labels[lift]+'</span>'
      +'<span class="num" style="font-size:18px;font-weight:600;color:var(--text)">'+d.v+' kg</span>'
      +'<span class="srcbadge '+(d.src==="manual"?"src-manual":"src-garmin")+'">'+(d.src==="manual"?"manual":"est.")+' \u00b7 '+d.date+'</span></div>'
      +'<div style="display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap">'
      +'<span style="font-size:11.5px;color:var(--muted)">Tested 1RM</span>'
      +'<input class="inp num rm-tested" style="width:72px" value="'+d.v+'"/><span style="font-size:11.5px;color:var(--muted)">kg</span>'
      +'<button class="btn-primary" data-action="save-1rm" data-lift="'+lift+'">Save 1RM</button>'
      +'<span style="font-size:11px;color:var(--muted);margin:0 2px">or estimate from a set</span>'
      +'<input class="inp num rm-w" style="width:58px" placeholder="kg"/><span style="color:var(--muted)">\u00d7</span><input class="inp num rm-r" style="width:54px" placeholder="reps"/>'
      +'<button class="btn-ghost" data-action="est-1rm" data-lift="'+lift+'">Estimate & save</button></div></div>';
  }
  function phaseColor(ph){ return ph==="Race"?"var(--good)":ph==="Peak"?"var(--coral)":ph==="Benchmark"?"var(--bike)":(ph==="Recovery"||ph==="Taper")?"var(--cool)":"var(--warm)"; }
  function phaseTimeline(){
    return '<div class="pcard" style="padding:18px">'+cardHead("compass","Training block","17 weeks \u00b7 18 May \u2192 13 Sep \u00b7 tap a week to view it")
      +'<div class="phases">'+PHASES.map((p,i)=>{ const n=i+1,active=n===state.week,isCur=n===CURRENT_WEEK,done=n<CURRENT_WEEK,color=phaseColor(p.phase);
        return '<button class="phase'+(active?' phase-on':'')+'" data-action="jump-week" data-week="'+n+'" style="opacity:'+(done&&!active?0.55:1)+'"><div class="phase-dot" style="background:'+((active||isCur)?color:"var(--track)")+';box-shadow:'+(isCur?'0 0 0 4px '+color+'30':'none')+'"></div><div style="font-size:11px;font-weight:700;color:'+(active?"var(--text)":"var(--muted)")+'">'+p.wk+'</div><div style="font-size:9px;color:var(--muted)">'+p.date+'</div><div class="phase-tag" style="color:'+color+';border-color:'+color+'44">'+p.phase+'</div><div style="font-size:8.5px;color:var(--muted);margin-top:4px;line-height:1.25">'+p.quality+'</div></button>';
      }).join("")+'</div></div>';
  }
  function sessionCard(s, day){
    const meta=SPORT[s.kind];
    const sIcon=s.status==="done"?"check-circle-2":s.status==="today"?"radio":s.status==="moved"?"arrow-right-left":"circle";
    const sColor=s.status==="done"?"var(--good)":s.status==="today"?"var(--warm)":s.status==="moved"?"var(--bike)":"var(--muted)";
    const movable=s.comp!=="none"&&s.kind!=="rest";
    let sel="";
    if(movable){ sel='<div style="margin-top:8px;display:flex;align-items:center;gap:6px">'+ic("arrow-right-left",11)+'<select class="daysel" data-action="move" data-day="'+day+'" data-id="'+s.id+'">'+DAYS.map(dd=>'<option value="'+dd+'"'+(dd===day?' selected':'')+'>'+dd+'</option>').join("")+'</select></div>'; }
    return '<div class="scard'+(s.status==="today"?' scard-today':'')+'" style="border-left:3px solid '+meta.color+'">'
      +'<div style="display:flex;align-items:flex-start;gap:9px">'+ic(sIcon,15)+'<div style="flex:1;min-width:0">'
      +'<button class="slink" data-action="session" data-id="'+s.id+'">'+ic(meta.icon,13)+'<span style="font-weight:600;font-size:12.5px">'+s.title+'</span>'+(s.keystone?'<span class="kbadge">key</span>':'')+'</button>'
      +'<div style="font-size:11px;color:var(--dim);margin-top:3px">'+s.target+'</div>'
      +(s.status==="moved"?'<div style="font-size:10.5px;color:var(--bike);margin-top:3px">moved from '+s.movedFrom+'</div>':'')
      +'</div></div>'+sel+'</div>';
  }
  function coachingView(){
    const week=state.schedule[state.week], phase=PHASES[state.week-1], warns=guardrails(week);
    const today='<div class="pcard" style="padding:20px;border-left:3px solid var(--cool)"><span style="display:inline-flex;align-items:center;gap:8px;color:var(--cool);font-size:12px;font-weight:600">'+ic("sunrise",15)+' TODAY \u00b7 FRIDAY \u00b7 WEEK 7</span>'
      +'<h2 style="margin:8px 0 6px;font-size:19px;font-weight:600;color:var(--text)">Easy aerobic day — spin, don\'t grind</h2>'
      +'<p style="margin:0;color:var(--dim);font-size:13.5px;line-height:1.55;max-width:760px">Today is a <b style="color:var(--text)">Zone 2 ride plus mobility (HR 135\u2013150)</b> — keep it genuinely easy so tomorrow\'s 9 km long run is fresh. You\'ve already banked Wednesday\'s <b style="color:var(--text)">6\u00d7800 at 5:40\u20135:50</b>. HRV (62 ms) and Body Battery (62) both sit in normal range.</p>'
      +'<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><span class="chip">'+ic("bike",13)+' Zone 2 ride + mobility today</span><span class="chip">'+ic("footprints",13)+' 9 km long run tomorrow</span><span class="chip">'+ic("check-circle-2",13)+' 6\u00d7800 done Wed</span></div></div>';
    const nav='<div class="pcard" style="padding:18px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><div style="display:flex;align-items:center;gap:12px">'
      +'<button class="iconbtn" data-action="week-prev"'+(state.week<=1?' disabled':'')+'>'+ic("chevron-left",16)+'</button>'
      +'<div><span style="display:inline-flex;align-items:center;gap:8px;color:var(--text);font-weight:600;font-size:14px">'+ic("calendar",16)+' Week '+state.week+' \u00b7 '+phase.phase+(state.week===CURRENT_WEEK?' <span class="chip" style="padding:3px 8px;font-size:10px;background:rgba(242,165,75,0.12);color:var(--warm);border:1px solid rgba(242,165,75,0.3)">this week</span>':'')+'</span><div style="font-size:11.5px;color:var(--muted);margin-top:3px">'+WEEK_RANGE(state.week)+' \u00b7 move any session, the plan stays intact</div></div>'
      +'<button class="iconbtn" data-action="week-next"'+(state.week>=17?' disabled':'')+'>'+ic("chevron-right",16)+'</button></div>'
      +'<span class="chip">'+ic("info",12)+' Matches by session, not day</span></div>'
      +warns.map(w=>'<div class="warn">'+ic("alert-triangle",14)+' '+w+'</div>').join("")
      +'<div class="board">'+DAYS.map(d=>'<div class="col"><div class="colhead"><span style="font-weight:700;font-size:12px;color:var(--text)">'+d+'</span><span style="font-size:10px;color:var(--muted)">'+week[d].date+'</span></div>'+(week[d].sessions.length?week[d].sessions.map(s=>sessionCard(s,d)).join(""):'<div class="empty">open</div>')+'</div>').join("")+'</div></div>';
    const exec='<div class="pcard" style="padding:18px">'+cardHead("target","Execution score","How well you\'re running the plan")+'<div style="display:flex;align-items:center;gap:20px;margin-top:12px">'+ringSVG(EXECUTION.score)+'<div style="flex:1">'
      +EXECUTION.parts.map(p=>'<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span style="color:var(--dim)">'+p[0]+'</span><span style="color:var(--text);font-weight:600">'+p[1]+'</span></div><div style="height:4px;background:var(--track);border-radius:4px"><div style="width:'+p[1]+'%;height:100%;background:'+(p[1]<82?"var(--warn)":"var(--cool)")+';border-radius:4px"></div></div></div>').join("")
      +'</div></div></div>';
    const agents=section("AI coaching agents","Each read cites live data \u00b7 6 active",'<div class="agent-grid">'+AGENTS.map(a=>{ const tone=a.tone==="ok"?"var(--good)":a.tone==="warn"?"var(--warn)":"var(--muted)";
      return '<div class="pcard" style="padding:15px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--text)">'+ic(a.icon,15)+' '+a.name+'</span><span style="width:7px;height:7px;border-radius:7px;background:'+tone+'"></span></div><p style="margin:0;font-size:12.5px;color:var(--dim);line-height:1.5">'+a.out+'</p><div style="margin-top:9px;font-size:10.5px;color:var(--muted)">'+a.ts+' \u00b7 Garmin MCP</div></div>';
    }).join("")+'</div>');
    const rules=[["heart-pulse","Easy work is HR-governed","Easy runs graded on HR 140\u2013155, rides on 135\u2013150 — not pace. The Easy Day Audit flags drift into Z3."],["shield-alert","Shin-pain substitution","Log shin pain over 3/10 and the coach swaps the quality run for a Zone 2 ride, resuming once it settles."],["dumbbell","Strength tapers itself","Leg volume scales down through the taper while watching soreness, so lifting never blunts race legs."],["target","Benchmarks recalibrate","Your Week 14 5k time trial is hard calibration — it tightens the sub-60 projection more than any easy run."],["arrow-right-left","Move days freely","Shift any session and the plan stays intact; the coach re-checks 48h spacing between hard efforts."],["brain","Changes show their reasoning","Every adjustment cites the data behind it — completion, pace, HR, HRV, Body Battery, shin-pain input."]];
    const adaptation='<div class="pcard" style="padding:18px">'+cardHead("brain","How PerformanceOS adapts your plan","Rules lifted from your coaching notes — now transparent")+'<div class="rulegrid">'+rules.map(r=>'<div class="rule">'+ic(r[0],16)+'<div><div style="font-size:12.5px;font-weight:600;color:var(--text)">'+r[1]+'</div><div style="font-size:11.5px;color:var(--dim);margin-top:3px;line-height:1.45">'+r[2]+'</div></div></div>').join("")+'</div></div>';
    return '<div class="stack">'+today+phaseTimeline()+nav+'<div class="coach-grid">'+exec+injuryCard()+'</div>'+agents+adaptation+'</div>';
  }
  function goalsView(){
    const tbl='<div class="pcard tbl-card" style="padding:4px"><table><thead><tr>'+["Goal","Sport","Target","Date","Status"].map(h=>'<th>'+h+'</th>').join("")+'</tr></thead><tbody><tr><td style="color:var(--text);font-weight:600">Bridge to Brisbane</td><td style="color:var(--dim)">Running</td><td class="num" style="color:var(--dim)">Sub-60:00 \u00b7 10 km</td><td style="color:var(--dim)">13 Sep 2026</td><td><span class="chip" style="background:rgba(100,224,163,0.12);color:var(--good);border:1px solid rgba(100,224,163,0.3)">Active \u00b7 A race</span></td></tr></tbody></table></div>';
    const next='<div class="pcard" style="padding:18px;border-style:dashed">'+cardHead("sparkles","Goal system — next build","Create races or performance targets")+'<p style="font-size:12.5px;color:var(--dim);line-height:1.5;margin-top:12px;margin-bottom:0">New goals get their own baseline snapshot, adaptive dashboard, and a clickable goal-detail that attributes fitness gains back to the sessions that drove them. Races here can sync to Garmin as calendar events; the dashboard re-anchors to whichever goal is active.</p></div>';
    return '<div class="stack"><div style="display:flex;justify-content:space-between;align-items:center">'+section("Active goal","","")+'<button class="btn-ghost">'+ic("plus",13)+' New goal</button></div>'+goalHero(true)+section("All goals","",tbl)+next+'</div>';
  }
  function reportsView(){
    const parts=[["Prior week","4 of 5 sessions completed. 42 km run, 2h Zone 2 riding. Wednesday's threshold hit target pace; Sunday's long run drifted to Z3 in the final 3 km."],["Recovery","HRV held in the normal band all week, RHR steady at 48. Sleep averaged 7h15 — no accumulated debt heading into the new block."],["Readiness","Training Readiness green 5 of 7 mornings. Body Battery recharging fully overnight. Cleared for a full quality week."],["Injury risk","Low. Acute:chronic 1.12, monotony 1.4. One watch item — easy-run intensity creeping into Z3. Rein in easy pace."]];
    const grid='<div class="report-grid">'+parts.map(p=>'<div><div class="rlabel">'+p[0]+'</div><p class="rbody">'+p[1]+'</p></div>').join("")
      +'<div style="grid-column:1 / -1"><div class="rlabel">This week\'s plan</div><p class="rbody">Hold the Build week as written: 6\u00d7800 Wednesday, 9 km long run Saturday. Keep easy runs by HR (140\u2013155). If shins flag over 3/10, swap Wednesday for a Zone 2 ride.</p></div></div>';
    const review='<div class="pcard" style="padding:20px">'+cardHead("brain","Monday Review","Runs automatically every Monday 6am — here\'s last week\'s",'<span class="chip">'+ic("radio",12)+' Auto-generated</span>')+grid+'</div>';
    const more='<div class="pcard" style="padding:18px;border-style:dashed">'+cardHead("file-text","More reports — next build","Weekly, block-end and race-readiness summaries")+'<p style="font-size:12.5px;color:var(--dim);line-height:1.5;margin-top:12px;margin-bottom:0">Exportable weekly and block reviews, a pre-race readiness report in race week, and a post-race analysis that grades execution against your pacing plan.</p></div>';
    return '<div class="stack">'+review+more+'</div>';
  }

  /* ------------------------------- modals -------------------------------- */
  function buildCoach(m, st){
    const p=Math.abs(st.pct).toFixed(1);
    if(m.neutralCopy) return "Body mass has held within about 1 kg across the window ("+m.value+" kg now). Tracked as context for load and pace — no target attached.";
    if(m.key==="load") return "Acute load sits at "+m.value+" with an acute:chronic ratio of 1.12 — inside the 0.8\u20131.3 band where fitness builds without a spike in injury risk. Keep the ramp gradual.";
    if(m.polarity==="down"&&st.improved) return "Down "+p+"% over the window, which is the right direction — faster/lower is better here. This trend is what carries you under 60:00. Protect it with consistent easy days.";
    if(m.polarity==="down"&&!st.improved) return "Up "+p+"% over the window — the wrong direction for this metric. Worth watching; check easy days stay easy and sleep holds.";
    if(st.improved) return "Up "+p+"% over the window and trending the right way. Exactly the adaptation the block is built to produce — stay the course.";
    return "Down "+p+"% over the window. A dip isn't alarming on its own, but if it persists, ease the load and prioritise recovery.";
  }
  function metricModal(key, win){
    const m=effMetric(byKey(key)); const weekly=!!m.gen.weekly; const total=weekly?52:365;
    const full=genSeries(Object.assign({n:total},m.gen));
    const count=weekly?Math.max(3,Math.round(win/7)):win;
    const slice=full.slice(-count); const vals=slice.map(d=>d.value);
    const avgW=weekly?4:Math.max(3,Math.round(count/8)); const avg=rolling(vals,avgW);
    const reg=regression(vals); const first=vals[0], last=vals[vals.length-1];
    const pct=first?((last-first)/Math.abs(first))*100:0;
    const improved=m.polarity==="neutral"?null:(m.polarity==="down"?last<first:last>first);
    const rows=slice.map((d,i)=>({label:shortDate(d.date),value:vals[i],avg:avg[i],trend:+(reg.intercept+reg.slope*i).toFixed(2)}));
    const fmtY=(v)=> m.isTime?mmss(v):(m.fmt?m.fmt(v):round2(v));
    const chart=m.chart==="bar"?barChart(rows,{fmtY:fmtY,avg:true}):lineChart(rows,{fmtY:fmtY,avg:true,trend:true});
    const dir=improved==null?"flat":(improved?"up":"down");
    const dirColor=dir==="up"?"var(--good)":dir==="down"?"var(--bad)":"var(--muted)";
    const dirIcon=dir==="up"?"trending-up":dir==="down"?"trending-down":"minus";
    const pctTxt=(pct>0?"+":"")+pct.toFixed(1)+"%";
    const wins=[7,30,90,365];
    return '<div class="modal">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start"><div>'
      +'<div style="display:inline-flex;align-items:center;gap:9px;color:var(--text)">'+ic(m.icon,18)+'<h3 style="margin:0;font-size:17px;font-weight:600">'+m.label+'</h3>'+(m.badge?'<em class="badge" style="font-style:normal">'+m.badge+'</em>':'')+'</div>'
      +'<div style="display:flex;align-items:baseline;gap:10px;margin-top:8px"><span class="num" style="font-size:30px;font-weight:600;color:var(--text)">'+m.value+'</span><span style="color:var(--muted);font-size:13px">'+m.unit+'</span>'
      +(improved==null?'<span style="color:var(--muted);font-size:12px">'+pctTxt+' over window</span>':'<span style="color:'+dirColor+';display:inline-flex;align-items:center;gap:4px;font-weight:600;font-size:12px">'+ic(dirIcon,14)+' '+pctTxt+' \u00b7 '+(improved?"improving":"declining")+'</span>')
      +'</div></div><button class="iconbtn" data-action="close">'+ic("x",18)+'</button></div>'
      +'<div style="display:flex;gap:6px;margin:14px 0 10px">'+wins.map(w=>'<button class="seg'+(w===win?' segOn':'')+'" data-action="win" data-win="'+w+'">'+w+'d</button>').join("")+'</div>'
      +'<div style="height:230px">'+chart+'</div>'
      +'<div style="display:flex;gap:16px;margin:6px 2px 14px;font-size:11px;color:var(--muted)"><span class="legend"><span style="width:14px;border-top:2px solid var(--warm)"></span>Value</span><span class="legend"><span style="width:14px;border-top:2px solid var(--cool)"></span>Rolling avg</span><span class="legend"><span style="width:14px;border-top:2px dashed var(--muted)"></span>Trend</span></div>'
      +'<div class="coachbox"><span style="display:inline-flex;align-items:center;gap:7px;color:var(--warm);font-weight:600;font-size:12.5px">'+ic("compass",15)+' Coaching read</span><p style="margin:7px 0 0;color:var(--dim);font-size:13px;line-height:1.5">'+buildCoach(m,{pct:pct,improved:improved})+'</p><div style="margin-top:9px;font-size:10.5px;color:var(--muted);display:flex;gap:14px"><span>Source \u00b7 Garmin'+(m.badge==="est."?" (est. from logged sets)":"")+'</span><span>Synced \u00b7 2h ago</span><span>Confidence \u00b7 '+(m.badge==="est."?"Medium":"High")+'</span></div></div></div>';
  }
  function scoreModal(key){
    const s=SCORES.find(x=>x.key===key); const accent=s.accent==="warm"?"var(--warm)":"var(--cool)";
    return '<div class="modal" style="max-width:460px"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0;font-size:17px;font-weight:600">'+s.label+' Score</h3><button class="iconbtn" data-action="close">'+ic("x",18)+'</button></div>'
      +'<div style="display:flex;align-items:baseline;gap:8px;margin:12px 0"><span class="num" style="font-size:40px;font-weight:600;color:'+accent+'">'+s.value+'</span><span style="color:var(--muted)">/100 \u00b7 '+s.src+'</span></div>'
      +'<p style="color:var(--dim);font-size:13px;line-height:1.5;margin-top:0">'+s.note+'</p>'
      +'<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:12px"><span style="font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px">Wrapping Garmin native — inputs</span>'
      +s.inputs.map(kv=>'<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px"><span style="color:var(--dim)">'+kv[0]+'</span><span style="color:var(--text);font-weight:600">'+kv[1]+'</span></div>').join("")+'</div>'
      +'<p style="font-size:11px;color:var(--muted);margin-top:12px">For now this reads Garmin\'s own metric and adds a coaching layer. A custom composite is on the roadmap.</p></div>';
  }
  function goalModal(){
    const proj=PROJ.k10, base=3696, net=proj-base;
    return '<div class="modal" style="max-width:760px"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div>'
      +'<span style="display:inline-flex;align-items:center;gap:8px;color:var(--warm);font-size:12px;font-weight:600">'+ic("sunrise",15)+' RACE GOAL \u00b7 WHAT\'S DRIVING IT</span>'
      +'<h3 style="margin:8px 0 2px;font-size:18px;font-weight:600;color:var(--text)">'+RACE.name+' — sub-'+mmss(RACE.goalSec)+'</h3>'
      +'<span style="font-size:12.5px;color:var(--muted)">'+daysTo+' days out \u00b7 projected '+mmss(proj)+' ('+mmss(PROJ.band[0])+'\u2013'+mmss(PROJ.band[1])+')</span></div>'
      +'<button class="iconbtn" data-action="close">'+ic("x",18)+'</button></div>'
      +'<div style="height:200px;margin-top:14px">'+trajectoryChart()+'</div>'
      +'<div class="coachbox" style="margin-top:8px;display:flex;align-items:center;gap:16px"><div><div style="font-size:11px;color:var(--muted)">Since you set this goal</div><div class="num" style="font-size:26px;font-weight:600;color:var(--good)">'+mmss(Math.abs(net))+' faster</div></div>'
      +'<div style="font-size:12px;color:var(--dim);line-height:1.45">Your projected 10 km has moved from <b style="color:var(--text)">'+mmss(base)+'</b> to <b style="color:var(--text)">'+mmss(proj)+'</b>. Here\'s what training moved it — grouped by block, since a single session rarely shifts a race projection on its own.</div></div>'
      +'<div style="margin-top:12px">'+ATTRIBUTION.map(a=>'<div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--line)"><span class="num" style="min-width:52px;font-size:14px;font-weight:600;color:var(--good)">\u2212'+mmss(Math.abs(a.delta))+'</span><div><div style="font-size:13px;font-weight:600;color:var(--text)">'+a.block+'</div><div style="font-size:11.5px;color:var(--dim);margin-top:2px">'+a.why+'</div></div></div>').join("")+'</div>'
      +'<div style="margin-top:12px;font-size:11px;color:var(--muted);line-height:1.5;display:flex;gap:8px">'+ic("info",14)+'<span>Contributions are directional, not exact — they track how far your projected finish moved across each block, not a precise per-run credit. Your Week 14 benchmark 5k is the next big calibration and will tighten these numbers.</span></div></div>';
  }
  function findSession(id){
    if(id==="push-demo") return {kind:"push",title:"Strength \u00b7 Push (last session)",target:"Maintain \u00b7 low soreness",comp:"load"};
    for(let w=1;w<=17;w++){ const wk=state.schedule[w]; for(const d of DAYS){ const s=wk[d].sessions.find(x=>x.id===id); if(s) return s; } }
    return null;
  }
  function strengthDetail(){
    const main=PUSH_SETS.find(e=>e.main); const top=main.sets[main.sets.length-1]; const oneRM=epley(top[0],top[1]);
    return '<span class="chip" style="background:rgba(79,209,197,0.12);color:var(--cool);border:1px solid rgba(79,209,197,0.3)">'+ic("check-circle-2",12)+' Auto-matched to Garmin strength activity</span>'
      +'<div class="coachbox" style="margin-top:12px;display:flex;align-items:center;gap:16px"><div><div style="font-size:11px;color:var(--muted)">Bench \u00b7 est. 1RM (Epley)</div><div class="num" style="font-size:28px;font-weight:600;color:var(--text)">'+oneRM+' <span style="font-size:13px;color:var(--muted)">kg</span></div></div><div style="font-size:11.5px;color:var(--dim);line-height:1.45">From your top logged set <b style="color:var(--text)">'+top[0]+' kg \u00d7 '+top[1]+'</b>. Updates whenever you log a heavier set in Garmin.</div></div>'
      +'<div style="margin-top:14px">'+PUSH_SETS.map(ex=>'<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px;font-weight:600;color:var(--text);display:inline-flex;align-items:center;gap:7px">'+ex.name+(ex.main?' <span class="kbadge">main lift</span>':'')+'</span><span class="srcbadge '+(ex.src==="manual"?"src-manual":"src-garmin")+'">'+(ex.src==="manual"?"manual":"Garmin")+'</span></div><div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">'+ex.sets.map(st=>'<span class="setpill num">'+st[0]+'kg \u00d7 '+st[1]+'</span>').join("")+'</div>'+(ex.flag?'<div style="font-size:10.5px;color:var(--warn);margin-top:5px;display:inline-flex;align-items:center;gap:5px">'+ic("alert-triangle",11)+' '+ex.flag+'</div>':'')+'</div>').join("")+'</div>'
      +'<p style="font-size:10.5px;color:var(--muted);margin-top:12px;line-height:1.45">Garmin auto-detection isn\'t perfect — correct a mislabelled exercise on the Strength page, or enter a tested 1RM directly there.</p>';
  }
  function sessionModal(id){
    const s=findSession(id); if(!s) return "";
    const meta=SPORT[s.kind]||{icon:"dumbbell",color:"var(--str)"};
    const isStr=["push","pull","legs"].indexOf(s.kind)>=0;
    const graded=s.comp==="hr"?"heart-rate zone":s.comp==="pace"?"pace-in-range":s.comp==="load"?"load & soreness":"completion";
    let body;
    if(isStr){ body=strengthDetail(); }
    else {
      const why={quality:"6\u00d7800 at 5:40\u20135:50 sits just under goal 10k pace — the stimulus that lifts your threshold toward sub-60. Graded on whether the reps land in the pace window.",easy:"Kept aerobic on purpose (HR 140\u2013155). Graded on time-in-zone, not pace — running these too hard is the #1 way easy days steal from your quality sessions.",long:"Aerobic base with an optional goal-pace finish. The long run is the other hard day of the week, which is why the guardrail watches what sits beside it.",bike:"Zone 2 support volume (HR 135\u2013150). Aerobic load without the impact — and the swap target if shin pain flares.",strides:"Supporting work. Light by design; the app won\'t let it drift into a hard day.",mobility:"Supporting work. Light by design.",rest:"Full recovery."}[s.kind]||"Supporting work.";
      body='<div class="coachbox"><span style="display:inline-flex;align-items:center;gap:7px;color:var(--warm);font-weight:600;font-size:12.5px">'+ic("compass",15)+' Why this session</span><p style="margin:7px 0 0;color:var(--dim);font-size:12.5px;line-height:1.5">'+why+'</p></div>';
    }
    return '<div class="modal"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="display:inline-flex;align-items:center;gap:9px">'+ic(meta.icon,17)+'<h3 style="margin:0;font-size:16px;font-weight:600;color:var(--text)">'+s.title+'</h3>'+(s.keystone?'<span class="kbadge">keystone</span>':'')+'</div><div style="font-size:12px;color:var(--dim);margin-top:6px">Target \u00b7 '+s.target+' &nbsp;\u00b7&nbsp; graded on '+graded+'</div></div><button class="iconbtn" data-action="close">'+ic("x",18)+'</button></div><div style="margin-top:16px">'+body+'</div></div>';
  }

  /* ------------------------------- shell --------------------------------- */
  const NAV = [["Dashboard","layout-dashboard"],["Performance","trending-up"],["Recovery","heart-handshake"],["Running","route"],["Strength","dumbbell"],["Coaching","compass"],["Goals","flag"],["Reports","file-text"]];
  const SUBTITLE = {Dashboard:"Am I improving, recovering, and on track?",Performance:"Fitness, thresholds and records over time.",Recovery:"HRV, sleep and readiness — are you absorbing the work?",Running:"Pace, threshold, and your road to sub-60.",Strength:"Push / Pull / Legs, captured from Garmin.",Coaching:"Today's call, the week's plan, and why.",Goals:"What you're training for.",Reports:"Automated reviews and summaries."};

  function viewHTML(){
    switch(state.view){
      case "Dashboard": return dashboardView();
      case "Performance": return performanceView();
      case "Recovery": return recoveryView();
      case "Running": return runningView();
      case "Strength": return strengthView();
      case "Coaching": return coachingView();
      case "Goals": return goalsView();
      case "Reports": return reportsView();
    }
    return "";
  }
  function shell(){
    const sidebar='<aside class="sidebar"><div class="sidebar-brand" style="display:flex;align-items:center;gap:10px;padding:4px 6px 22px"><div style="width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,var(--warm),var(--coral));display:grid;place-items:center;color:#0E1420">'+ic("sunrise",17)+'</div><div><div style="font-weight:700;font-size:14.5px;color:var(--text);letter-spacing:-0.2px">PerformanceOS</div><div style="font-size:10px;color:var(--muted)">'+esc(state.profileName)+' \u00b7 Garmin-first</div></div></div>'
      +'<nav class="navwrap">'+NAV.map(n=>'<button class="nav'+(state.view===n[0]?' navOn':'')+'" data-action="view" data-view="'+n[0]+'">'+ic(n[1],17)+' '+n[0]+'</button>').join("")+'</nav>'
      +'<div class="sidebar-foot" style="margin-top:auto;padding-top:16px"><div class="pcard" style="padding:12px;background:var(--panel2)"><div style="display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--dim);font-weight:600">'+ic("radio",13)+' Data source</div><div style="font-size:11px;color:var(--muted);margin:6px 0 9px;line-height:1.4">Fixtures modeled on Garmin MCP tool outputs.</div><button class="connectbtn">'+ic("zap",12)+' Connect Garmin MCP</button></div></div></aside>';
    const syncChip=state.live
      ? '<span class="chip" style="border-color:rgba(100,224,163,0.4);color:var(--good)">'+ic("radio",13)+' Live '+syncAgo(state.live.syncedAt)+'</span>'
      : '<span class="chip">'+ic("radio",13)+' Demo data</span>';
    const banner=state.live
      ? '<div class="banner" style="border-color:rgba(100,224,163,0.28);background:linear-gradient(90deg,rgba(100,224,163,0.10),rgba(100,224,163,0.02))"><span style="display:inline-flex;align-items:center;gap:8px;color:var(--good)">'+ic("check-circle-2",14)+' Live data from '+esc(state.live.source||"Garmin Connect")+' — last synced '+syncAgo(state.live.syncedAt)+'.</span></div>'
      : '<div class="banner"><span style="display:inline-flex;align-items:center;gap:8px">'+ic("shield-alert",14)+' Demo data shaped like real Garmin outputs. Add a GARMINTOKENS secret to sync live; the UI won\'t change.</span></div>';
    const main='<main class="main"><header class="topbar"><div><h1 style="margin:0;font-size:19px;font-weight:600;color:var(--text)">'+state.view+'</h1><span style="font-size:12px;color:var(--muted)">'+SUBTITLE[state.view]+'</span></div>'
      +'<div style="display:flex;align-items:center;gap:10px"><span class="chip">'+ic("calendar",13)+' '+daysTo+' days to '+RACE.name+'</span>'+syncChip+'</div></header>'
      +banner
      +'<div class="content fade">'+viewHTML()+'</div></main>';
    const coachFab='<button class="coachfab" data-action="coach" title="Send your coach a weekly check-in (opens Claude, pre-filled with this week\'s data)">'+ic("message-circle",18)+'<span>Weekly check-in</span></button>';
    return sidebar+main+coachFab;
  }

  function render(){
    document.getElementById("app").className="pos-root";
    document.getElementById("app").innerHTML=shell();
    renderModal();
    if(window.lucide) window.lucide.createIcons();
  }
  function renderModal(){
    const root=document.getElementById("modal-root"); const m=state.modal;
    if(!m){ root.innerHTML=""; return; }
    let inner="";
    if(m.type==="metric") inner=metricModal(m.key,m.win);
    else if(m.type==="score") inner=scoreModal(m.key);
    else if(m.type==="goal") inner=goalModal();
    else if(m.type==="session") inner=sessionModal(m.id);
    root.innerHTML='<div class="overlay" data-action="overlay">'+inner+'</div>';
    if(window.lucide) window.lucide.createIcons();
  }

  /* ------------------------------ events --------------------------------- */
  function closest(el, sel){ while(el && el!==document){ if(el.matches && el.matches(sel)) return el; el=el.parentNode; } return null; }

  document.addEventListener("click", function(e){
    const t=closest(e.target,"[data-action]"); if(!t) return;
    const a=t.getAttribute("data-action");
    if(a==="view"){ state.view=t.getAttribute("data-view"); state.modal=null; render(); }
    else if(a==="coach"){ openCoach(); }
    else if(a==="metric"){ state.modal={type:"metric",key:t.getAttribute("data-key"),win:90}; renderModal(); }
    else if(a==="score"){ state.modal={type:"score",key:t.getAttribute("data-key")}; renderModal(); }
    else if(a==="goal"){ state.modal={type:"goal"}; renderModal(); }
    else if(a==="session"){ state.modal={type:"session",id:t.getAttribute("data-id")}; renderModal(); }
    else if(a==="win"){ state.modal.win=+t.getAttribute("data-win"); renderModal(); }
    else if(a==="close"){ state.modal=null; renderModal(); }
    else if(a==="overlay"){ if(e.target===t){ state.modal=null; renderModal(); } }
    else if(a==="jump-week"){ state.week=+t.getAttribute("data-week"); render(); }
    else if(a==="week-prev"){ state.week=Math.max(1,state.week-1); render(); }
    else if(a==="week-next"){ state.week=Math.min(17,state.week+1); render(); }
    else if(a==="save-1rm"){ saveTested(t.getAttribute("data-lift"),t); }
    else if(a==="est-1rm"){ saveEstimate(t.getAttribute("data-lift"),t); }
  });
  document.addEventListener("change", function(e){
    const t=closest(e.target,'[data-action="move"]'); if(!t) return;
    const to=t.value, from=t.getAttribute("data-day"), id=t.getAttribute("data-id");
    if(to===from) return;
    const wk=state.schedule[state.week];
    const idx=wk[from].sessions.findIndex(s=>s.id===id); if(idx<0) return;
    const s=wk[from].sessions.splice(idx,1)[0]; s.status="moved"; s.movedFrom=from; wk[to].sessions.push(s);
    render();
  });
  function rowFor(el){ return closest(el,"[data-lift]"); }
  function saveTested(lift, btn){
    const row=rowFor(btn); const val=parseFloat(row.querySelector(".rm-tested").value);
    if(val>0){ state.oneRM[lift]={v:Math.round(val),src:"manual",date:"3 Jul"}; render(); }
  }
  function saveEstimate(lift, btn){
    const row=rowFor(btn); const w=parseFloat(row.querySelector(".rm-w").value), r=parseFloat(row.querySelector(".rm-r").value);
    if(w>0&&r>0){ state.oneRM[lift]={v:epley(w,r),src:"manual",date:"3 Jul"}; render(); }
  }

  /* --------------------------- live Garmin data -------------------------- */
  function syncAgo(iso){
    const t=Date.parse(iso); if(isNaN(t)) return "recently";
    const s=Math.max(0,(Date.now()-t)/1000);
    if(s<90) return "just now";
    if(s<5400) return Math.round(s/60)+"m ago";
    if(s<172800) return Math.round(s/3600)+"h ago";
    return Math.round(s/86400)+"d ago";
  }
  // Overlay live values from data/garmin.json onto the fixtures, in place.
  function applyLive(data){
    if(!data || data.live!==true) return false;
    const m=data.metrics||{};
    Object.keys(m).forEach(k=>{ const t=byKey(k); if(t && m[k]!=null && m[k]!=="") t.value=String(m[k]); });
    const sc=data.scores||{};
    Object.keys(sc).forEach(k=>{ const t=SCORES.find(s=>s.key===k); if(t && typeof sc[k]==="number") t.value=sc[k]; });
    if(Array.isArray(data.runs) && data.runs.length){
      const clean=data.runs.filter(r=>r&&r.dist>0).map(r=>({
        date:String(r.date||""), type:String(r.type||"Run"),
        dist:+r.dist||0, paceSec:+r.paceSec||0, hr:+r.hr||0, tag:String(r.tag||"")
      }));
      if(clean.length){ RUNS.length=0; clean.forEach(r=>RUNS.push(r)); }
    }
    // Live race predictor (projected 10 km) — Garmin's own prediction
    const p=data.predictions||{};
    if(typeof p.k10==="number" && p.k10>0){
      PROJ.k10=Math.round(p.k10);
      PROJ.band=(Array.isArray(p.band)&&p.band.length===2)
        ? p.band.map(x=>Math.round(+x))
        : [Math.round(PROJ.k10*0.975), Math.round(PROJ.k10*1.025)];
      // Slide the trajectory curve so its final point lands on the live projection (keeps the shape)
      const shift=PROJ.k10 - TRAJECTORY[TRAJECTORY.length-1].p;
      TRAJECTORY.forEach(t=>{ t.p+=shift; t.lo+=shift; t.hi+=shift; });
      // Refresh the Race Predictor agent card copy
      const ag=AGENTS.find(a=>a.name==="Race Predictor");
      if(ag) ag.out="Projected 10k "+mmss(PROJ.k10)+" ("+mmss(PROJ.band[0])+"–"+mmss(PROJ.band[1])+"). "
        +(PROJ.k10<RACE.goalSec?"On the right side of "+mmss(RACE.goalSec)+".":"Above "+mmss(RACE.goalSec)+" — keep sharpening.");
    }
    state.live={ syncedAt:data.syncedAt, source:data.source };
    return true;
  }
  function loadLiveData(){
    // Registry: resolve the active profile's display name (non-fatal if missing).
    fetch("data/profiles.json?t="+Date.now(),{cache:"no-store"})
      .then(r=>r.ok?r.json():null)
      .then(reg=>{
        const p=reg && reg.profiles && reg.profiles[state.profile];
        if(p && p.name){ state.profileName=p.name; render(); }
      })
      .catch(()=>{});
    // This profile's live Garmin data.
    fetch("data/"+state.profile+"/garmin.json?t="+Date.now(),{cache:"no-store"})
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(applyLive(d)) render(); })
      .catch(()=>{ /* offline or no file — keep demo fixtures */ });
  }

  /* ----------------------- weekly coach check-in ------------------------- */
  // Build a pre-filled coaching update from whatever the dashboard is showing
  // (live values after a sync, fixtures otherwise).
  function coachPrompt(){
    const mv=(k)=>{ const m=byKey(k); return m?m.value:"—"; };
    const src=state.live?("live, synced "+syncAgo(state.live.syncedAt)):"demo data";
    const runs=RUNS.slice(0,5).map(r=>"  - "+r.date+": "+r.type+" — "+r.dist+" km @ "+pace(r.paceSec)+"/km, avg HR "+(r.hr||"—")).join("\n");
    return [
"You are my endurance running coach. Below is my weekly training check-in for my goal race.",
"Please review how my week went against the data, then suggest any adjustments to next week's training. Ask me anything you need.",
"",
"[profile: "+state.profile+"]   (any plan changes apply ONLY to this profile)",
"",
"HOW MY WEEK FELT (I'll fill this in):",
"- Overall how training felt (1-10) and why:",
"- Any niggles, pain or injury concerns:",
"- Sleep and life stress this week:",
"- Sessions I completed / missed / moved:",
"- Anything I want changed next week:",
"",
"MY CURRENT DATA (from my PerformanceOS dashboard — "+src+"):",
"- Goal: "+RACE.name+" ("+RACE.dist+"), "+daysTo+" days out, target sub-"+mmss(RACE.goalSec),
"- Projected 10k: "+mmss(PROJ.k10)+" (range "+mmss(PROJ.band[0])+"–"+mmss(PROJ.band[1])+")",
"- VO2 max: "+mv("vo2")+" | HRV: "+mv("hrv")+" ms | Resting HR: "+mv("rhr")+" bpm | Body Battery: "+mv("battery"),
"- Sleep score: "+mv("sleep")+" | Readiness: "+((SCORES.find(s=>s.key==="readiness")||{}).value||"—")+"/100 | Weekly distance: "+mv("wdist")+" km",
"- 10k PB: "+mv("pb10")+" | 5k PB: "+mv("pb5"),
"- Recent runs:",
runs||"  (none recorded)"
    ].join("\n");
  }
  function openCoach(){
    const text=coachPrompt();
    // Copy to clipboard as a fallback so the full update is always pasteable,
    // regardless of any URL-length limits at the destination.
    try{ if(navigator.clipboard) navigator.clipboard.writeText(text).catch(()=>{}); }catch(e){}
    const url=COACH_BASE+"?q="+encodeURIComponent(text);
    window.open(url,"_blank","noopener");
  }

  render();
  loadLiveData();
})();
