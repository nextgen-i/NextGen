(function(){
  'use strict';
  // Pages may include this script more than once; initialize auth/workspace only once.
  if (window.NGWorkspace && window.NGWorkspace.__initialized) return;
  if (!window.supabase || !window.NEXTGEN_SUPABASE_CONFIG || typeof window.getNextGenSupabaseClient !== 'function') return;
  let client;
  try { client = window.getNextGenSupabaseClient(); }
  catch (error) { console.error('NextGen shared auth initialization failed:', error); return; }
  const $ = id => document.getElementById(id);
  const main = document.querySelector('.app main');
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  let user = null;
  let channels = [];
  let content = [];
  let settings = null;
  let authPanel, authMessage;
  function showAuthPanel(){
    const drawer=document.getElementById('ng-menu-drawer');
    if(!drawer)return;
    if(authPanel)authPanel.remove();
    authPanel=document.createElement('div');
    authPanel.id='ng-workspace-auth';
    authPanel.style.cssText='margin:14px 0 4px;padding:12px;border:1px solid #285a89;border-radius:11px;background:#07142d;color:#eef5ff';
    const title=document.createElement('strong');title.textContent='NextGen Account';title.style.cssText='display:block;margin-bottom:8px;color:#fff;font-size:14px';
    authMessage=document.createElement('p');authMessage.className='muted';authMessage.style.cssText='font-size:12px;line-height:1.45;margin:0 0 8px;color:#a8c1e8';
    const input=document.createElement('input');input.type='email';input.autocomplete='email';input.placeholder='Your email address';input.required=true;input.id='ng-workspace-email';input.style.cssText='box-sizing:border-box;width:100%;min-height:42px;margin:0 0 8px;padding:9px;border:1px solid #285a89;border-radius:8px;background:#203452;color:#fff;font-size:16px';
    const passwordWrap=document.createElement('div');passwordWrap.style.cssText='position:relative;margin:0 0 8px';
    const password=document.createElement('input');password.type='password';password.autocomplete='current-password';password.placeholder='Password';password.required=true;password.id='ng-workspace-password';password.minLength=8;password.hidden=true;password.style.cssText='box-sizing:border-box;width:100%;min-height:42px;margin:0;padding:9px 66px 9px 9px;border:1px solid #285a89;border-radius:8px;background:#203452;color:#fff;font-size:16px';
    const passwordToggle=document.createElement('button');passwordToggle.type='button';passwordToggle.textContent='Show';passwordToggle.setAttribute('aria-label','Show password');passwordToggle.setAttribute('aria-pressed','false');passwordToggle.hidden=true;passwordToggle.style.cssText='position:absolute;right:9px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:#8bdcff;font-size:13px;font-weight:700;padding:7px 5px';
    passwordToggle.addEventListener('click',function(){const visible=password.type==='password';password.type=visible?'text':'password';passwordToggle.textContent=visible?'Hide':'Show';passwordToggle.setAttribute('aria-label',visible?'Hide password':'Show password');passwordToggle.setAttribute('aria-pressed',visible?'true':'false');password.focus();});
    passwordWrap.append(password,passwordToggle);
    const button=document.createElement('button');button.type='button';button.textContent='Sign in';button.style.cssText='width:100%;min-height:42px;padding:8px 12px;border:1px solid #21bdf1;border-radius:9px;background:#0c3154;color:#fff;font-weight:700';
    let passwordStep=false;
    button.addEventListener('click',async function(){
      const email=input.value.trim();
      if(!passwordStep){
        if(!input.checkValidity()||!email){authMessage.textContent='Enter a valid email address.';input.focus();return;}
        passwordStep=true;password.hidden=false;passwordToggle.hidden=false;passwordToggle.style.display='inline-block';button.textContent='Login';authMessage.textContent='Enter your password to continue.';password.focus();return;
      }
      if(!password.value||password.value.length<8){authMessage.textContent='Enter your password (at least 8 characters).';password.focus();return;}
      button.disabled=true;authMessage.textContent='Signing in…';
      try{
        const {data,error}=await client.auth.signInWithPassword({email,password:password.value});
        if(error)throw error;
        user=data.user||null;
        authMessage.textContent='Login successful.';
        setSignedIn();
      }catch(error){
        authMessage.textContent='Login failed: '+(error&&error.message?error.message:'Please check your email and password.');
      }finally{
        if(button.isConnected)button.disabled=false;
      }
    });
    authPanel.append(title,authMessage,input,passwordWrap,button);
    drawer.append(authPanel);
  }
  async function signOutAndVerify(){
    const result=await client.auth.signOut({scope:'local'});
    if(result.error)throw result.error;
    const verification=await client.auth.getSession();
    if(verification.error)throw verification.error;
    if(verification.data&&verification.data.session)throw new Error('The session is still active. Please try again.');
    user=null;
    showAuth();
    return {error:null};
  }
  function setSignedIn(){
    if(!authPanel)return;
    authPanel.innerHTML='';
    const title=document.createElement('strong');title.textContent='NextGen Account';title.style.cssText='display:block;margin-bottom:6px;color:#fff;font-size:14px';
    const info=document.createElement('p');info.className='muted';info.textContent='Signed in as '+(user.email||'authenticated user');info.style.cssText='font-size:12px;line-height:1.45;margin:0 0 9px;color:#a8c1e8;overflow-wrap:anywhere';
    const button=document.createElement('button');button.type='button';button.textContent='Sign out';button.style.cssText='width:100%;min-height:40px;padding:8px 12px;border:1px solid #285a89;border-radius:9px;background:#10213d;color:#fff;font-weight:700';
    button.addEventListener('click',async()=>{button.disabled=true;try{await signOutAndVerify();info.textContent='Signed out.';}catch(error){button.disabled=false;info.textContent='Could not sign out: '+(error&&error.message?error.message:'Please try again.');}});
    authPanel.append(title,info,button);
  }
  async function requireUser(){
    // Re-check the authenticated user against Supabase before loading private rows.
    // This avoids relying on a stale/null local variable during mobile page refresh.
    const result=await client.auth.getUser();
    if(result.error)throw result.error;
    user=result.data&&result.data.user?result.data.user:null;
    if(!user)throw new Error('You are not signed in. Open the profile menu and sign in, then refresh Channels.');
    return user;
  }
  async function loadBase(){
    await requireUser();
    // Load channels independently so an unrelated Content or Settings
    // permission/schema error cannot leave stale starter cards on Channels.
    // Let Supabase Row Level Security scope the rows to the authenticated owner.
    // Do not duplicate the owner predicate in the browser query: the access token
    // and the separately refreshed user object can briefly be out of sync on mobile.
    const c=await client.from('channels')
      .select('id,platform,display_name,handle,profile_url,connection_status,is_paused')
      .order('created_at',{ascending:false});
    if(c.error)throw c.error;
    channels=c.data||[];
    if(page==='channels.html'){
      let diag=document.getElementById('ng-channels-diagnostic');
      if(!diag){
        diag=document.createElement('p');
        diag.id='ng-channels-diagnostic';
        diag.style.cssText='margin:8px 10px;padding:8px 10px;border:1px solid #2857a4;border-radius:9px;background:#071a3e;color:#cfe5ff;font-size:11px;line-height:1.4;overflow-wrap:anywhere';
        const list=document.querySelector('.app main .list');
        if(list)list.insertAdjacentElement('beforebegin',diag);
      }
      if(diag)diag.textContent='Account: '+(user.email||'signed in')+' · User ID: '+user.id+' · Channels loaded: '+channels.length+' · YouTube: '+channels.filter(x=>String(x.platform||'').toLowerCase()==='youtube').length;
    }
    const [items,s]=await Promise.all([
      client.from('content_items').select('id,channel_id,platform,content_type,title,caption,hashtags,tags,keywords,thumbnail_url,thumbnail_prompt,status,scheduled_for,created_at').order('created_at',{ascending:false}).limit(100),
      client.from('automation_settings').select('*').eq('owner_id',user.id).maybeSingle()
    ]);
    content=items.error?[]:(items.data||[]);
    settings=s.error?null:(s.data||null);
  }
  function parseList(v){return String(v||'').split(/[,;\n]/).map(x=>x.trim().replace(/^#/,'')).filter(Boolean);}
  function safeText(node,value){if(node)node.textContent=value==null?'':String(value);}
  function empty(root,message){if(root){root.innerHTML='';const p=document.createElement('p');p.className='muted';p.textContent=message;root.append(p);}}
  function addEntry(root,title,meta,description,actions){
    const el=document.createElement('div');el.className='ng-entry';
    const t=document.createElement('strong');t.textContent=title||'Untitled';
    const m=document.createElement('small');m.textContent=meta||'';
    const p=document.createElement('p');p.textContent=description||'';
    el.append(t,m,p);
    (actions||[]).forEach(a=>{const b=document.createElement('button');b.type='button';b.textContent=a.label;b.addEventListener('click',a.onClick);el.append(b);});
    root.append(el);
  }
  async function saveDraft(form){
    const platform=($('draftPlatform')&&$('draftPlatform').value)||'youtube';
    const typeMap={'Reels / Short Video':'reel','Long-form Video':'long_form_video','Photo Post':'photo_post','Carousel Photo Post':'carousel_photo_post','Story':'story','Text Post':'text_post'};
    const row={
      owner_id:user.id,platform,content_type:typeMap[$('draftType').value]||'reel',
      title:$('draftTitle').value.trim(),caption:$('draftCaption').value.trim(),
      thumbnail_url:$('draftImage').value.trim()||null,thumbnail_prompt:$('draftPrompt').value.trim()||null,
      hashtags:parseList($('draftHash').value),tags:parseList($('draftTags').value),keywords:parseList($('draftTags').value),
      status:'draft',safety_checks:{manual_review_required:true,checks_completed:false,published:false,scheduled:false}
    };
    const {error}=await client.from('content_items').insert(row);
    if(error)throw error;
    form.reset();setNote('draftNote','Draft saved to your NextGen account. It is unpublished and awaits your review.',false);
    await loadBase();renderContent();
  }
  function renderChannels(){
    const root=document.querySelector('.app main .list');if(!root)return;
    const platformClass={youtube:'yt',facebook:'fb',instagram:'ig',threads:'th'};
    const platformLabel={youtube:'YouTube',facebook:'Facebook',instagram:'Instagram',threads:'Threads'};
    const templates={};
    Object.keys(platformClass).forEach(platform=>{
      const template=root.querySelector('.card.'+platformClass[platform]);
      if(template)templates[platform]=template.cloneNode(true);
    });
    // Rebuild from saved channels, while retaining one starter card for
    // every platform that has not yet been added by the user.
    root.innerHTML='';
    const seenChannels=new Set();
    const renderedPlatforms=new Set();
    channels.forEach(ch=>{
      const platform=String(ch.platform||'').toLowerCase();
      const handleKey=String(ch.handle||'').replace(/^@/,'').trim().toLowerCase();
      const profileKey=String(ch.profile_url||'').trim().toLowerCase().replace(/\\?.*$/,'').replace(/\\/$/,'');
      const uniqueKey=platform+'|'+(handleKey||profileKey||String(ch.id||''));
      if(seenChannels.has(uniqueKey))return;
      seenChannels.add(uniqueKey);
      const card=(templates[platform]||document.createElement('div')).cloneNode(true);
      card.className='card '+(platformClass[platform]||'');
      const nameNode=card.querySelector('.info b');
      const handleNode=card.querySelector('.info span');
      const statusNode=card.querySelector('.st');
      if(nameNode)nameNode.textContent=ch.display_name||platformLabel[platform]||'Channel';
      if(handleNode)handleNode.textContent=ch.handle?'@'+String(ch.handle).replace(/^@/,''):'Profile name pending';
      if(statusNode)statusNode.textContent='Connection: '+(ch.connection_status||'pending')+(ch.is_paused?' · Paused':'');
      const review=card.querySelector('[data-review]');
      if(review){
        review.addEventListener('click',()=>{
          alert((ch.display_name||platformLabel[platform]||'Channel')+'\n'+(ch.handle?'@'+String(ch.handle).replace(/^@/,''):'')+'\nConnection: '+(ch.connection_status||'pending')+'. Connect the platform API before publishing.');
        });
      }
      root.append(card);
      renderedPlatforms.add(platform);
    });
    Object.keys(platformClass).forEach(platform=>{
      if(renderedPlatforms.has(platform)||!templates[platform])return;
      const card=templates[platform].cloneNode(true);
      card.classList.add(platformClass[platform]);
      const nameNode=card.querySelector('.info b');
      const statusNode=card.querySelector('.st');
      if(nameNode)nameNode.textContent=platformLabel[platform];
      if(statusNode)statusNode.textContent='App connection: Not verified';
      root.append(card);
    });
  }
  function renderContent(){
    const root=$('draftList');if(!root)return;
    root.innerHTML='';safeText($('draftCount'),content.length);
    if(!content.length){empty(root,'No drafts saved in this account yet.');return;}
    content.forEach(item=>addEntry(root,item.title,item.content_type+' · '+item.platform+' · '+item.status,item.caption,[
      {label:'Copy SEO',onClick:()=>navigator.clipboard?.writeText([item.title,item.caption,(item.hashtags||[]).map(x=>'#'+x).join(' '),(item.tags||[]).join(', ')].filter(Boolean).join('\n'))},
      ...(item.status==='draft'||item.status==='pending_approval'?[{label:'Delete',onClick:async()=>{if(!confirm('Delete this draft?'))return;const {error}=await client.from('content_items').delete().eq('id',item.id);if(error){setNote('draftNote',error.message,true);return;}await loadBase();renderContent();}}]:[])
    ]));
  }
  async function setApprovalMode(mode){
    const enabled=mode==='auto';
    const {error}=await client.from('automation_settings').upsert({
      owner_id:user.id,approval_mode:mode,auto_approval_enabled:enabled,background_mode_enabled:false,
      timezone:'Asia/Kolkata',daily_idea_times:(settings&&settings.daily_idea_times)||['08:00:00','14:00:00','18:00:00']
    },{onConflict:'owner_id'});
    if(error)throw error;
    settings=Object.assign({},settings||{},{approval_mode:mode,auto_approval_enabled:enabled,background_mode_enabled:false});
    if($('manualMode'))$('manualMode').classList.toggle('selected',!enabled);
    if($('autoMode'))$('autoMode').classList.toggle('selected',enabled);
    if($('modeNote'))$('modeNote').textContent=enabled?'Auto mode preference saved. No automatic approval or publishing worker is active; every post still needs an explicit approval action.':'Manual Approval is active. Every post requires your explicit approval.';
    if($('manual-approval-mode'))$('manual-approval-mode').setAttribute('aria-pressed',String(!enabled));
    if($('auto-approval-mode'))$('auto-approval-mode').setAttribute('aria-pressed',String(enabled));
    if($('publishing-mode-label'))$('publishing-mode-label').textContent=enabled?'Auto Approval Mode — ON':'Manual Approval Mode — ON';
    if($('auto-approval-label'))$('auto-approval-label').textContent=enabled?'ON':'OFF';
    if($('approval-mode-note'))$('approval-mode-note').textContent=enabled?'Auto mode preference saved only. No automatic approval or publishing worker is active.':'Manual Approval is active. Every post requires your explicit approval.';
    if($('dash1-publishing-status'))$('dash1-publishing-status').textContent=enabled?'Auto Approval preference — ON (no auto-publisher active)':'Manual Approval Mode — ON';
    if($('dash1-manual-approval'))$('dash1-manual-approval').classList.toggle('is-selected',!enabled);
    if($('dash1-auto-approval'))$('dash1-auto-approval').classList.toggle('is-selected',enabled);
  }
  function renderApprovals(){
    const root=$('approvalList');if(!root)return;
    root.innerHTML='';
    const pending=content.filter(x=>['draft','pending_approval'].includes(x.status));
    if(!pending.length){empty(root,'No drafts awaiting review.');return;}
    pending.forEach(item=>addEntry(root,item.title,item.platform+' · '+item.content_type+' · '+item.status,item.caption,[
      {label:'Approve',onClick:async()=>{const {error}=await client.rpc('review_content_item',{p_content_id:item.id,p_action:'approved',p_note:null});if(error){setNote('modeNote',error.message,true);return;}await loadBase();renderApprovals();}},
      {label:'Reject',onClick:async()=>{const note=prompt('Optional reason for rejection:')||'';const {error}=await client.rpc('review_content_item',{p_content_id:item.id,p_action:'rejected',p_note:note});if(error){setNote('modeNote',error.message,true);return;}await loadBase();renderApprovals();}}
    ]));
  }
  function fillSelect(select,items,placeholder,labelFn){
    if(!select)return;select.innerHTML='';
    const first=document.createElement('option');first.value='';first.textContent=placeholder;select.append(first);
    items.forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=labelFn(x);select.append(o);});
  }
  async function saveDailyTimes(){
    const times=[$('slotMorning').value,$('slotAfternoon').value,$('slotEvening').value].filter(Boolean);
    const {error}=await client.from('automation_settings').upsert({owner_id:user.id,approval_mode:(settings&&settings.approval_mode)||'manual',auto_approval_enabled:!!(settings&&settings.auto_approval_enabled),background_mode_enabled:false,timezone:'Asia/Kolkata',daily_idea_times:times},{onConflict:'owner_id'});
    if(error)throw error;
    setNote('slotNote','Daily plan times saved to your NextGen account. These are planning reminders only.',false);
    await loadBase();
  }
  async function scheduleContent(){
    const contentId=$('scheduleContent').value,channelId=$('scheduleChannel').value;
    const date=$('scheduleDate').value,time=$('scheduleTime').value;
    if(!contentId||!channelId||!date||!time)throw new Error('Choose approved content, a channel, date and time.');
    const scheduled=new Date(date+'T'+time+':00');
    if(Number.isNaN(scheduled.getTime())||scheduled<=new Date())throw new Error('Choose a future date and time.');
    const {error}=await client.rpc('schedule_approved_content',{p_content_id:contentId,p_channel_id:channelId,p_scheduled_for:scheduled.toISOString()});
    if(error)throw error;
    setNote('scheduleNote','Added to the NextGen queue. No post was sent to a social platform.',false);
    $('scheduleForm').reset();$('scheduleTime').value='08:00';await loadBase();renderSchedule();
  }
  async function renderSchedule(){
    fillSelect($('scheduleContent'),content.filter(x=>x.status==='approved'),'Choose an approved draft',x=>x.title+' · '+x.platform);
    fillSelect($('scheduleChannel'),channels.filter(x=>!x.is_paused),'Choose an active channel',x=>x.display_name+' · '+x.platform);
    const root=$('scheduleList');if(!root)return;
    root.innerHTML='';
    const {data:jobs,error}=await client.from('publishing_jobs').select('id,content_id,channel_id,scheduled_for,status').order('scheduled_for',{ascending:true}).limit(100);
    if(error)throw error;
    if(!jobs||!jobs.length){empty(root,'No scheduled jobs in your account yet.');return;}
    jobs.forEach(job=>{
      const item=content.find(x=>x.id===job.content_id),channel=channels.find(x=>x.id===job.channel_id);
      addEntry(root,item?item.title:'Scheduled content', (channel?channel.display_name:'Channel')+' · '+new Date(job.scheduled_for).toLocaleString()+' · '+job.status,'Queued in NextGen. Publishing has not been performed.',[
        ...(job.status==='queued'?[{label:'Cancel',onClick:async()=>{const {error}=await client.from('publishing_jobs').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',job.id);if(error){setNote('scheduleNote',error.message,true);return;}await loadBase();renderSchedule();}}]:[])
      ]);
    });
  }
  function periodDays(){
    const v=$('analyticsPeriod')?.value||'Last 28 days';
    return v.includes('7')?7:v.includes('90')?90:28;
  }
  async function loadAnalytics(){
    const start=new Date();start.setDate(start.getDate()-periodDays()+1);const from=start.toISOString().slice(0,10);
    const {data,error}=await client.from('channel_analytics_daily').select('channel_id,metric_date,views,followers,followers_gained,likes,comments,shares,watch_time_seconds,engagement_rate,source').gte('metric_date',from).order('metric_date',{ascending:false});
    if(error)throw error;
    const rows=data||[];
    const totals=rows.reduce((a,r)=>{a.views+=Number(r.views||0);a.likes+=Number(r.likes||0);a.comments+=Number(r.comments||0);a.shares+=Number(r.shares||0);a.watch+=Number(r.watch_time_seconds||0);return a;},{views:0,likes:0,comments:0,shares:0,watch:0});
    const latestByChannel={};rows.forEach(r=>{if(!latestByChannel[r.channel_id])latestByChannel[r.channel_id]=Number(r.followers||0);});
    const followers=Object.values(latestByChannel).reduce((a,b)=>a+b,0);
    const engagement=totals.views?((totals.likes+totals.comments+totals.shares)/totals.views*100):null;
    const metricNodes=document.querySelectorAll('.ng-metric-grid article strong');
    if(metricNodes.length>=4){
      metricNodes[0].textContent=rows.length?totals.views.toLocaleString():'—';
      metricNodes[1].textContent=rows.length?followers.toLocaleString():'—';
      metricNodes[2].textContent=engagement===null?'—':engagement.toFixed(2)+'%';
      metricNodes[3].textContent=rows.length?(totals.watch/3600).toFixed(1)+' h':'—';
    }
    const status=$('ng-analytics-status')||document.querySelector('.ng-analytics-status');
    if(status)status.textContent=rows.length?'Metrics loaded from verified daily analytics records.':'No verified analytics have been synced from the platforms yet.';
    const platformRows=document.querySelectorAll('.ng-platform-row');
    const names=['youtube','facebook','instagram','threads'];
    platformRows.forEach((node,i)=>{
      const matching=channels.filter(c=>c.platform===names[i]);
      const label=node.querySelector('span');
      if(label)label.textContent=matching.length?matching.length+' channel(s) · '+matching.map(c=>c.connection_status).join(', '):'No connected channel record';
    });
  }
  async function renderDashboard(){
    const metric=document.querySelectorAll('.dash1-analytics-grid .dash1-metric strong');
    const {data:analytics,error}=await client.from('channel_analytics_daily').select('views,watch_time_seconds,followers,metric_date,channel_id').order('metric_date',{ascending:false}).limit(1000);
    if(error)throw error;
    const rows=analytics||[];
    const views=rows.reduce((a,r)=>a+Number(r.views||0),0),watch=rows.reduce((a,r)=>a+Number(r.watch_time_seconds||0),0);
    const latest={};rows.forEach(r=>{if(!latest[r.channel_id])latest[r.channel_id]=Number(r.followers||0);});
    if(metric.length>=4){metric[0].textContent=rows.length?views.toLocaleString():'—';metric[1].textContent=rows.length?(watch/3600).toFixed(1):'—';metric[2].textContent=rows.length?Object.values(latest).reduce((a,b)=>a+b,0).toLocaleString():'—';metric[3].textContent='—';}
    const notice=document.querySelector('.dash1-analytics-notice');if(notice)notice.textContent=rows.length?'Verified analytics records loaded. Revenue is not available in the current integration.':'No verified analytics have been synced yet. Figures remain blank rather than showing estimates.';
    const recent=document.querySelector('.dash1-content-list');
    if(recent){recent.innerHTML='';const items=content.slice(0,5);if(!items.length)empty(recent,'No content saved in your workspace yet.');else items.forEach(x=>{const article=document.createElement('article');article.className='dash1-content-row';const info=document.createElement('div');info.className='dash1-content-info';const h=document.createElement('h3');h.textContent=x.title||'Untitled';const p=document.createElement('p');p.textContent=x.platform+' · '+x.status;info.append(h,p);article.append(info);recent.append(article);});}
    const channelRows=document.querySelectorAll('.dash1-channel-overview .dash1-overview-row');
    channelRows.forEach((node,i)=>{const label=node.querySelector('span:nth-child(2)');const status=node.querySelector('.dash1-planned');const name=['youtube','facebook','instagram','threads'][i];const group=channels.filter(c=>c.platform===name);if(label)label.textContent=name[0].toUpperCase()+name.slice(1);if(status)status.textContent=group.length?group.length+' · '+group[0].connection_status:'Not connected';});
    const pending=content.filter(x=>['draft','pending_approval'].includes(x.status)).length;
    const pendingCard=document.querySelector('.dash1-recent-head');if(pendingCard)pendingCard.setAttribute('data-pending-count',String(pending));
    const mode=settings&&settings.approval_mode==='auto'?'auto':'manual';
    if($('dash1-publishing-status'))$('dash1-publishing-status').textContent=mode==='auto'?'Auto Approval preference — ON (no auto-publisher active)':'Manual Approval Mode — ON';
  }
  async function renderSettings(){
    const {data:connections,error}=await client.from('platform_connections').select('platform,connection_status,display_name,handle,last_error').order('platform');
    if(error)throw error;
    const panel=$('integrations');if(panel){const rows=panel.querySelectorAll('.ng-settings-line');const names=['youtube','facebook','instagram','threads'];rows.forEach((row,i)=>{const match=(connections||[]).find(x=>x.platform===names[i]);const span=row.querySelector('span');if(span)span.textContent=match?(match.display_name||match.handle||match.connection_status)+' · '+match.connection_status:'Not connected';});}
    const prefs=await client.from('notification_preferences').select('*').eq('owner_id',user.id).maybeSingle();
    if(prefs.error)throw prefs.error;
    const root=$('ng-notification-controls');
    if(root){
      root.innerHTML='';
      const values=prefs.data||{in_app_enabled:true,email_enabled:true,push_enabled:false,approval_updates:true,publishing_updates:true,connection_alerts:true,weekly_analytics:true};
      const labels=[['in_app_enabled','In-app notifications'],['email_enabled','Email notifications'],['push_enabled','Push notifications'],['approval_updates','Approval updates'],['publishing_updates','Publishing updates'],['connection_alerts','Connection alerts'],['weekly_analytics','Weekly analytics summary']];
      labels.forEach(([key,label])=>{
        const row=document.createElement('label');row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 2px;border-bottom:1px solid #17385c;color:#eaf3ff;font-size:13px';
        const span=document.createElement('span');span.textContent=label;
        const input=document.createElement('input');input.type='checkbox';input.checked=!!values[key];input.addEventListener('change',async()=>{
          const next=Object.assign({},values,{[key]:input.checked,owner_id:user.id,timezone:'Asia/Kolkata',updated_at:new Date().toISOString()});
          const {error}=await client.from('notification_preferences').upsert(next,{onConflict:'owner_id'});
          if(error){input.checked=!input.checked;const note=$('ng-notification-note');if(note)note.textContent='Could not save: '+error.message;}
          else Object.assign(values,next);
        });
        row.append(span,input);root.append(row);
      });
    }
  }
  async function refresh(){
    try{
      await loadBase();
      if(page==='content.html')renderContent();
      if(page==='channels.html'){
        renderChannels();
        const mode=settings&&settings.approval_mode==='auto';
        if($('publishing-mode-label'))$('publishing-mode-label').textContent=mode?'Auto Approval Mode — ON':'Manual Approval Mode — ON';
        if($('auto-approval-label'))$('auto-approval-label').textContent=mode?'ON':'OFF';
      }
      if(page==='approvals.html'){
        renderApprovals();
        const mode=settings&&settings.approval_mode==='auto'?'auto':'manual';
        if($('manualMode'))$('manualMode').classList.toggle('selected',mode==='manual');
        if($('autoMode'))$('autoMode').classList.toggle('selected',mode==='auto');
        if($('modeNote'))$('modeNote').textContent=mode==='manual'?'Manual Approval is active. Every post requires your explicit approval.':'Auto mode preference saved; no automatic approval worker is active.';
      }
      if(page==='schedule.html'){
        const slots=settings&&settings.daily_idea_times||['08:00:00','14:00:00','18:00:00'];
        ['Morning','Afternoon','Evening'].forEach((name,i)=>{const input=$('slot'+name);if(input)input.value=String(slots[i]||'08:00').slice(0,5);});
        await renderSchedule();
      }
      if(page==='analytics.html')await loadAnalytics();
      if(page==='dashboard.html'||page==='index.html')await renderDashboard();
      if(page==='settings.html')await renderSettings();
    }catch(e){
      const msg='Workspace data could not be loaded: '+(e.message||'Unknown error');
      ['draftNote','modeNote','slotNote','scheduleNote'].forEach(id=>setNote(id,msg,true));
      const status=document.querySelector('.ng-analytics-status');if(status)status.textContent=msg;
      if(page==='channels.html'){
        let notice=document.getElementById('ng-channels-load-error');
        if(!notice){notice=document.createElement('p');notice.id='ng-channels-load-error';notice.style.cssText='margin:12px 0;padding:12px;border:1px solid #f45b78;border-radius:10px;background:#321329;color:#ffe5ec;font-size:13px;line-height:1.45';const list=document.querySelector('.app main .list');if(list)list.insertAdjacentElement('beforebegin',notice);}
        if(notice)notice.textContent=msg;
      }
    }
  }
  function bindPage(){
    if($('draftForm')){
      $('draftForm').onsubmit=null;
      $('draftForm').addEventListener('submit',async e=>{e.preventDefault();try{await saveDraft(e.currentTarget);}catch(err){setNote('draftNote',err.message,true);}});
      if($('copySeo'))$('copySeo').addEventListener('click',()=>navigator.clipboard?.writeText(['draftTitle','draftCaption','draftHash','draftTags'].map(id=>$(id)?.value||'').filter(Boolean).join('\n')));
    }
    if($('manualMode')){$('manualMode').onclick=null;$('manualMode').addEventListener('click',()=>setApprovalMode('manual').catch(e=>setNote('modeNote',e.message,true)));}
    if($('autoMode')){$('autoMode').onclick=null;$('autoMode').addEventListener('click',()=>setApprovalMode('auto').catch(e=>setNote('modeNote',e.message,true)));}
    if($('manual-approval-mode'))$('manual-approval-mode').addEventListener('click',()=>setApprovalMode('manual').catch(e=>setNote('approval-mode-note',e.message,true)));
    if($('auto-approval-mode'))$('auto-approval-mode').addEventListener('click',()=>setApprovalMode('auto').catch(e=>setNote('approval-mode-note',e.message,true)));
    if($('dash1-manual-approval')){$('dash1-manual-approval').onclick=null;$('dash1-manual-approval').addEventListener('click',()=>setApprovalMode('manual').catch(()=>{}));}
    if($('dash1-auto-approval')){$('dash1-auto-approval').onclick=null;$('dash1-auto-approval').addEventListener('click',()=>setApprovalMode('auto').catch(()=>{}));}
    if($('saveSlots')){$('saveSlots').onclick=null;$('saveSlots').addEventListener('click',()=>saveDailyTimes().catch(e=>setNote('slotNote',e.message,true)));}
    if($('scheduleForm')){$('scheduleForm').onsubmit=null;$('scheduleForm').addEventListener('submit',e=>{e.preventDefault();scheduleContent().catch(err=>setNote('scheduleNote',err.message,true));});}
    if($('analyticsPeriod'))$('analyticsPeriod').addEventListener('change',()=>loadAnalytics().catch(()=>{}));
  }
  function renderProfileAuthEntry(){
    window.dispatchEvent(new CustomEvent('nextgen-auth-state',{detail:{signedIn:!!user}}));
    const profileLinks=document.querySelector('.ng-profile-menu .ng-profile-links');
    const profileItems=profileLinks?[...profileLinks.querySelectorAll('[data-ng-auth-entry],a[href*="login.html"]')]:[];
    let profileItem=profileItems[0]||null;
    profileItems.slice(1).forEach(node=>node.remove());
    if(profileLinks&&!profileItem){
      profileItem=document.createElement('a');
      profileLinks.append(profileItem);
    }
    if(profileItem)profileItem.dataset.ngAuthEntry='true';

    const hamburgerItem=document.querySelector('#ng-menu-drawer .ng-menu-logout');
    // Keep a single auth row in each menu. Session reset is handled by
    // the same Login/Logout control rather than a second recovery row.
    document.querySelectorAll('[data-ng-session-reset]').forEach(node=>node.remove());
    const entries=[profileItem,hamburgerItem].filter(Boolean);
    entries.forEach(item=>{
      const signedIn=!!user;
      item.innerHTML=signedIn
        ? '<span class="ng-profile-icon" data-icon="logout"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v10M5.6 5.6a9 9 0 1 0 12.8 0"/></svg></span>Logout<i>›</i>'
        : '<span class="ng-profile-icon" data-icon="login"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 17 5-5-5-5m5 5H4m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"/></svg></span>Login<i>›</i>';
      item.href=signedIn?'#':'./login.html#options';
      item.removeAttribute('disabled');
      item.removeAttribute('aria-disabled');
      item.classList.add('ng-menu-login-active');
      item.setAttribute('aria-label',signedIn?'Logout':'Login');
      if(!item.dataset.authBound){
        item.dataset.authBound='1';
        item.addEventListener('click',async event=>{
          if(!user){
            if(item.tagName==='BUTTON'){
              event.preventDefault();
              location.href='./login.html#options';
            }
            return;
          }
          event.preventDefault();
          item.style.pointerEvents='none';
          item.style.opacity='.65';
          if(item.dataset.signingOut==='true')return;
          item.dataset.signingOut='true';
          try{
            await signOutAndVerify();
            location.replace('./login.html#options');
          }catch(error){
            item.setAttribute('aria-label','Logout failed — '+(error&&error.message?error.message:'try again'));
            let status=item.parentElement&&item.parentElement.querySelector('[data-ng-logout-status]');
            if(!status&&item.parentElement){
              status=document.createElement('p');
              status.dataset.ngLogoutStatus='true';
              status.setAttribute('role','alert');
              status.style.cssText='margin:6px 0 0;color:#ffb4b4;font-size:12px;line-height:1.4';
              item.parentElement.append(status);
            }
            if(status)status.textContent='Logout failed: '+(error&&error.message?error.message:'Please try again.');
          }finally{
            item.dataset.signingOut='false';
            item.style.pointerEvents='';
            item.style.opacity='';
          }
        });
      }
    });
  }
  function bindProfileAccountActions(){
    document.querySelectorAll('.ng-profile-switch-account').forEach(button=>{
      if(button.dataset.switchBound)return;
      button.dataset.switchBound='1';
      button.addEventListener('click',async()=>{
        if(button.dataset.switching==='true')return;
        const label=button.querySelector('span');
        const originalLabel=label?label.textContent:button.textContent;
        button.dataset.switching='true';
        button.disabled=true;
        button.setAttribute('aria-busy','true');
        if(label)label.textContent='Signing out…';
        try{
          const {error}=await client.auth.signOut({scope:'local'});
          if(error)throw error;
          const verification=await client.auth.getSession();
          if(verification.error)throw verification.error;
          if(verification.data&&verification.data.session)throw new Error('Previous session is still active; account switch was stopped.');
          user=null;
          renderProfileAuthEntry();
          location.replace('./login.html?switch-account=1#options');
        }catch(error){
          button.dataset.switching='false';
          button.disabled=false;
          button.removeAttribute('aria-busy');
          if(label)label.textContent=originalLabel;
          button.setAttribute('aria-label','Switch account failed: '+(error&&error.message?error.message:'Please try again'));
          let status=button.parentElement&&button.parentElement.querySelector('[data-switch-account-status]');
          if(!status&&button.parentElement){
            status=document.createElement('p');
            status.dataset.switchAccountStatus='true';
            status.setAttribute('role','alert');
            status.style.cssText='margin:6px 0 0;color:#ffb4b4;font-size:12px;line-height:1.4';
            button.parentElement.append(status);
          }
          if(status)status.textContent='Could not sign out. '+(error&&error.message?error.message:'Please try again.');
        }
      });
    });
    document.querySelectorAll('.ng-menu-main-links a[href*="login.html"],.ng-menu-main-links a[href*="logout"]').forEach(link=>link.remove());
  }
  if(document.body&&!window.__ngProfileMenuObserver){
    window.__ngProfileMenuObserver=new MutationObserver(()=>{
      bindProfileAccountActions();
      const entry=document.querySelector('#ng-menu-drawer .ng-menu-logout');
      if(entry){
        const signedIn=!!user;
        const authState=signedIn?'signed-in':'signed-out';
        if(entry.dataset.authState===authState)return;
        entry.dataset.authState=authState;
        entry.href=signedIn?'#':'./login.html#options';
        entry.innerHTML=signedIn
          ? '<span class="ng-profile-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v10M5.6 5.6a9 9 0 1 0 12.8 0"/></svg></span>Logout<i>›</i>'
          : '<span class="ng-profile-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 17 5-5-5-5m5 5H4m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"/></svg></span>Login<i>›</i>';
      }
    });
    window.__ngProfileMenuObserver.observe(document.body,{childList:true,subtree:true});
  }
  function showAuth(){
    bindProfileAccountActions();
    showAuthPanel();
    renderProfileAuthEntry();
    if(user)setSignedIn();
    else if(authMessage)authMessage.textContent='Sign in to enable secure database access. Local-only saving is disabled.';
  }
  async function syncAuthState(){
    const result=await client.auth.getSession();
    if(result.error)throw result.error;
    user=result.data&&result.data.session?result.data.session.user:null;
    showAuth();
    return user;
  }
  window.NGWorkspace={
    __initialized:true,
    client,
    getUser:()=>user,
    syncAuthState,
    refresh,
    signIn:async email=>client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}}),
    signOut:signOutAndVerify
  };

  bindPage();
  // Resolve the persisted Supabase session before rendering Login/Logout.
  // This prevents a signed-in user briefly (or incorrectly) seeing Login
  // while the initial session check is still pending.
  client.auth.getSession().then(({data,error})=>{
    if(error){
      if(authMessage)authMessage.textContent='Session check failed: '+error.message;
      user=null;
      showAuth();
      return;
    }
    user=data&&data.session?data.session.user:null;
    showAuth();
    if(user)refresh();
  }).catch(error=>{
    user=null;
    showAuth();
    if(authMessage)authMessage.textContent='Session check failed: '+(error&&error.message?error.message:'Please retry.');
  });
  // Do not call Supabase queries synchronously inside onAuthStateChange.
  // Supabase auth callbacks run under an internal lock; defer workspace reads
  // until the callback returns to avoid a stalled Channels refresh.
  client.auth.onAuthStateChange((_event,session)=>{
    user=session&&session.user?session.user:null;
    showAuth();
    if(user)setTimeout(()=>{if(user)refresh();},0);
  });


})();

/* Facebook-style navigation gestures: edge-swipe open, drawer-swipe close, outside tap and Android Back. */
(function(){
 'use strict';
 if(window.__ngFacebookDrawerGesturesV1)return;
 window.__ngFacebookDrawerGesturesV1=true;
 function init(){
  var drawer=document.getElementById('ng-menu-drawer');
  var backdrop=document.getElementById('ng-menu-backdrop');
  if(!drawer||!backdrop)return;
  var app=document.querySelector('.app');
  var trigger=document.getElementById('ng-hamburger');
  var historyEntry=false,ignorePop=false;
  function isOpen(){return drawer.classList.contains('is-open');}
  function open(){
   if(isOpen())return;
   if(trigger)trigger.click();
   if(isOpen()&&!historyEntry){
    try{history.pushState({ngDrawerOpen:true},'',location.href);historyEntry=true;}catch(e){}
   }
  }
  function close(){
   if(!isOpen())return;
   if(backdrop&&!backdrop.hidden)backdrop.click();
   else{
    drawer.classList.remove('is-open');drawer.setAttribute('aria-hidden','true');
    document.body.classList.remove('ng-menu-open');
    if(trigger)trigger.setAttribute('aria-expanded','false');
   }
   if(historyEntry){
    historyEntry=false;ignorePop=true;
    try{history.back();}catch(e){ignorePop=false;}
   }
  }
  // Keep Android's system Back inside the drawer instead of leaving the current page.
  window.addEventListener('popstate',function(){
   if(ignorePop){ignorePop=false;return;}
   if(isOpen()){
    historyEntry=false;
    if(backdrop&&!backdrop.hidden)backdrop.click();
    else{drawer.classList.remove('is-open');drawer.setAttribute('aria-hidden','true');document.body.classList.remove('ng-menu-open');}
   }
  });
  // Watch the existing hamburger controller so opening from its button gets a Back-stack entry too.
  var observer=new MutationObserver(function(){
   if(isOpen()&&!historyEntry){
    try{history.pushState({ngDrawerOpen:true},'',location.href);historyEntry=true;}catch(e){}
   }else if(!isOpen()&&historyEntry){
    historyEntry=false;ignorePop=true;
    try{history.back();}catch(e){ignorePop=false;}
   }
  });
  observer.observe(drawer,{attributes:true,attributeFilter:['class']});
  var start=null;
  function onStart(e){
   if(!e.touches||e.touches.length!==1)return;
   var t=e.touches[0];
   start={x:t.clientX,y:t.clientY,mode:isOpen()?'drawer':'page'};
  }
  function onMove(e){
   if(!start||!e.touches||e.touches.length!==1)return;
   var t=e.touches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;
   if(Math.abs(dx)<12||Math.abs(dx)<Math.abs(dy)*1.25)return;
   if(start.mode==='page'&&start.x<=26&&dx>35&&app){
    if(e.cancelable)e.preventDefault();
   }else if(start.mode==='drawer'&&dx<-35){
    if(e.cancelable)e.preventDefault();
   }
  }
  function onEnd(e){
   if(!start||!e.changedTouches||!e.changedTouches.length){start=null;return;}
   var t=e.changedTouches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;
   if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.25){
    if(start.mode==='page'&&start.x<=26&&dx>0)open();
    else if(start.mode==='drawer'&&dx<0)close();
   }
   start=null;
  }
  if(app){
   app.addEventListener('touchstart',onStart,{passive:true});
   app.addEventListener('touchmove',onMove,{passive:false});
   app.addEventListener('touchend',onEnd,{passive:true});
   app.addEventListener('touchcancel',function(){start=null;},{passive:true});
  }
  // The drawer closes naturally when the dimmed page/backdrop is tapped.
  backdrop.addEventListener('click',function(){
   if(historyEntry){historyEntry=false;ignorePop=true;try{history.back();}catch(e){ignorePop=false;}}
  });
  var style=document.createElement('style');
  style.id='ng-facebook-drawer-gesture-style-v1';
  style.textContent='#ng-menu-close,.ng-menu-account>button{display:none!important}#ng-menu-drawer{touch-action:pan-y!important;will-change:transform}';
  document.head.appendChild(style);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
