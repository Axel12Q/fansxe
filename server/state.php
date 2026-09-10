<?php
declare(strict_types=1);
require_once __DIR__.'/commerce.php';
require_once __DIR__.'/billing.php';
require_once __DIR__.'/social.php';
function feed(array $u,array $options=[]): array {
 $where=[]; $args=[]; $profile=real_id((string)($options['profile']??''),$u); $filter=$options['filter']??'todo';
 if($u['role']==='guest')$where[]="p.visibility='public'";
 if($profile) { $where[]='p.creator_id=?'; $args[]=$profile; }
 if(!empty($options['post'])){$where[]='p.id=?';$args[]=$options['post'];}
 if($filter==='likes') { $where[]='EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=?)'; $args[]=$u['id']; }
 if($filter==='siguiendo') { $where[]='EXISTS(SELECT 1 FROM follows f WHERE f.creator_id=p.creator_id AND f.follower_id=?)'; $args[]=$u['id']; }
 if(in_array($filter,['fotos','videos'],true)) { $where[]="JSON_SEARCH(p.media, 'one', ?, NULL, '$[*].kind') IS NOT NULL"; $args[]=$filter==='fotos'?'image':'video'; }
 $search=mb_substr((string)($options['search']??''),0,100);
 if($search!=='') { $where[]='(p.text LIKE ? OR u.name LIKE ? OR u.handle LIKE ?)'; array_push($args,'%'.$search.'%','%'.$search.'%','%'.$search.'%'); }
 $tag=mb_substr((string)($options['tag']??''),0,100); if($tag!=='') { $where[]='p.text LIKE ?'; $args[]='%#'.$tag.'%'; }
 if($search!=='' || $tag!=='') {
  $where[]="(p.visibility='public' OR p.creator_id=? OR EXISTS(SELECT 1 FROM subscriptions sub WHERE sub.user_id=? AND sub.creator_id=p.creator_id AND sub.expires_at>NOW()))";
  array_push($args,$u['id'],$u['id']);
 }
 $offset=max(0,min(100000,(int)($options['offset']??0)));
 $rows=query('SELECT p.* FROM posts p JOIN users u ON u.id=p.creator_id'.($where?' WHERE '.implode(' AND ',$where):'')." ORDER BY p.created_at DESC,p.id DESC LIMIT 7 OFFSET $offset",$args)->fetchAll();
 $more=count($rows)>6; $posts=[];
 foreach(array_slice($rows,0,6) as $p) {
  $can=readable($p,$u); $media=$can?json_value($p['media']):[];
  $comments=$can?query('SELECT c.*,u.name FROM comments c JOIN users u ON u.id=c.user_id WHERE post_id=? ORDER BY created_at,id LIMIT 200',[$p['id']])->fetchAll():[];
  $posts[]=['id'=>$p['id'],'creatorId'=>client_id($p['creator_id'],$u),'text'=>$can?$p['text']:'Contenido exclusivo para suscriptores.','media'=>$media,'visibility'=>$p['visibility'],'type'=>in_array('video',array_column($media,'kind'),true)?'videos':($media?'fotos':'texto'),'label'=>date('d/m/Y H:i',strtotime($p['created_at'])),'createdAt'=>timestamp($p['created_at']),
   'likes'=>(int)query('SELECT COUNT(*) FROM post_likes WHERE post_id=? AND user_id<>?',[$p['id'],$u['id']])->fetchColumn(),
   'comments'=>array_map(fn($c)=>['id'=>$c['id'],'text'=>$c['text'],'author'=>$c['name'],'userId'=>client_id($c['user_id'],$u)],$comments)];
 }
 return ['posts'=>$posts,'hasMore'=>$more];
}
function snapshot(array $u,array $options=[]): array {
 $following=[]; foreach(query('SELECT creator_id FROM follows WHERE follower_id=?',[$u['id']]) as $f) $following[client_id($f['creator_id'],$u)]=true;
 $followers=array_map(fn($r)=>client_id($r['follower_id'],$u),query('SELECT follower_id FROM follows WHERE creator_id=?',[$u['id']])->fetchAll());
 $users=[];
 foreach(query('SELECT u.*, (SELECT COUNT(*) FROM follows f WHERE f.creator_id=u.id) followers, (SELECT COUNT(*) FROM posts p WHERE p.creator_id=u.id) post_count, EXISTS(SELECT 1 FROM posts p WHERE p.creator_id=u.id) first_post, EXISTS(SELECT 1 FROM stories s WHERE s.creator_id=u.id) first_story FROM users u ORDER BY created_at DESC') as $r) {
  $id=client_id($r['id'],$u); $users[$id]=['id'=>$id,'name'=>$r['name'],'handle'=>$r['handle'],'bio'=>$r['bio'],'location'=>$r['location'],'avatarAsset'=>$r['avatar_asset'],'coverAsset'=>$r['cover_asset'],'followers'=>(int)$r['followers']-(!empty($following[$id])?1:0),'creatorStatus'=>$r['creator_status'],'privateAllowed'=>private_allowed($r['id']),'subscriptionGems'=>(int)$r['subscription_gems'],'subscriptionMxn'=>(int)$r['subscription_mxn'],'trialDays'=>(int)$r['trial_days'],'plus'=>((bool)$r['plus_owned']||($r['plus_expires_at']&&strtotime($r['plus_expires_at'])>time())),'profileAccent'=>$r['profile_accent'],'profileBorder'=>$r['profile_border'],'subscriptionCents'=>499,'verified'=>false,'hiddenBadges'=>json_value($r['hidden_badges']),'postCount'=>(int)$r['post_count'],'firstPost'=>(bool)$r['first_post'],'firstStory'=>(bool)$r['first_story']];
 }
 $likes=[]; foreach(query('SELECT post_id FROM post_likes WHERE user_id=?',[$u['id']]) as $r) $likes[$r['post_id']]=true;
 $subscriptions=[]; foreach(query('SELECT creator_id FROM subscriptions WHERE user_id=? AND expires_at>NOW()',[$u['id']]) as $r) $subscriptions[client_id($r['creator_id'],$u)]=true;
 $conversations=[];
 foreach(query('SELECT * FROM messages WHERE sender_id=? OR recipient_id=? ORDER BY created_at,id',[$u['id'],$u['id']]) as $r) {
  $id=$r['sender_id']===$u['id']?$r['recipient_id']:$r['sender_id']; $conversations[$id]??=['userId'=>$id,'messages'=>[],'unreadCount'=>0];
  if($r['recipient_id']===$u['id']&&!$r['read_at'])$conversations[$id]['unreadCount']++;
  $reference=$r['story_id']?row('SELECT * FROM stories WHERE id=?',[$r['story_id']]):null;
  $preview=$reference&&story_available($reference,$u)?story_data($reference,$u):null;
  $tip=!empty($r['gem_tip_id'])?row('SELECT gems FROM gem_tips WHERE id=?',[$r['gem_tip_id']]):null;
  $conversations[$id]['messages'][]=['id'=>$r['id'],'senderId'=>client_id($r['sender_id'],$u),'text'=>$r['text'],'media'=>json_value($r['media']),'createdAt'=>str_replace(' ','T',$r['created_at']).'Z','read'=>!!$r['read_at'],'storyReply'=>(bool)$r['story_reply'],'story'=>$preview,'gemTip'=>$tip?['gems'=>(int)$tip['gems']]:null];
 }
 $notifications=[];$read=[];
 foreach(query('SELECT * FROM notifications WHERE recipient_id=? ORDER BY created_at DESC LIMIT 100',[$u['id']]) as $r) { $notifications[]=['id'=>$r['id'],'userId'=>client_id($r['actor_id'],$u),'kind'=>$r['kind'],'href'=>$r['kind']==='message'?'mensajes.html?user='.rawurlencode(client_id($r['actor_id'],$u)):($r['kind']==='payout'?'admin.html':null),'text'=>$r['text'],'time'=>date('d/m/Y H:i',strtotime($r['created_at']))]; if($r['read_at']) $read[$r['id']]=true; }
 $requests=[];
 foreach(query('SELECT * FROM age_requests'.($u['role']==='admin'?'':' WHERE user_id=?').' ORDER BY submitted_at,id',$u['role']==='admin'?[]:[$u['id']]) as $r) $requests[]=['id'=>$r['id'],'userId'=>client_id($r['user_id'],$u),'document'=>media_data($r['document_id']),'status'=>$r['status'],'note'=>$r['note'],'submittedAt'=>timestamp($r['submitted_at']),'reviewedAt'=>$r['reviewed_at']?timestamp($r['reviewed_at']):null];
 $stories=[]; $storyLikes=[];$storySeen=[];
 $highlights=[];
 foreach(query('SELECT * FROM story_highlights ORDER BY created_at,id') as $h) {
  $ids=array_column(query('SELECT story_id FROM highlight_stories WHERE highlight_id=?',[$h['id']])->fetchAll(),'story_id');
  $highlights[]=['id'=>$h['id'],'userId'=>client_id($h['user_id'],$u),'name'=>$h['name'],'coverAsset'=>$h['cover_asset'],'stories'=>$ids];
 }
 foreach(query('SELECT s.* FROM stories s WHERE creator_id=? OR EXISTS(SELECT 1 FROM highlight_stories hs WHERE hs.story_id=s.id) OR (expires_at>NOW() AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=? AND f.creator_id=s.creator_id)) ORDER BY created_at,id',[$u['id'],$u['id']]) as $r) $stories[]=story_data($r,$u);
 foreach($conversations as $conversation)foreach($conversation['messages'] as $message)if($message['story']&&!in_array($message['story']['id'],array_column($stories,'id'),true))$stories[]=$message['story'];
 foreach(query('SELECT * FROM story_reactions WHERE user_id=?',[$u['id']]) as $r) {if($r['liked'])$storyLikes[$r['story_id']]=true; if($r['seen'])$storySeen[$r['story_id']]=true;}
 foreach($stories as &$story) {
  $story['likeCount']=(int)query('SELECT COUNT(*) FROM story_reactions WHERE story_id=? AND liked=1',[$story['id']])->fetchColumn();
  if($story['creatorId']==='demo') {
   $story['viewers']=array_map(fn($r)=>['userId'=>client_id($r['user_id'],$u),'liked'=>(bool)$r['liked']],query('SELECT user_id,liked FROM story_reactions WHERE story_id=? AND seen=1 AND user_id<>?',[$story['id'],$u['id']])->fetchAll());
   $story['viewCount']=count($story['viewers']);
  }
 } unset($story);
 if($u['role']==='guest')$users['demo']=['id'=>'demo','name'=>'Visitante','handle'=>'','bio'=>'','followers'=>0,'hiddenBadges'=>[],'creatorStatus'=>'none'];
 return ['guest'=>$u['role']==='guest','billing'=>billing_enabled()?billing_state($u):null,'commerce'=>commerce_state($u),'selfId'=>$u['id'],'session'=>$u['role']==='guest'?null:['email'=>$u['email'],'name'=>$u['name'],'role'=>$u['role']], 'csrf'=>$_SESSION['csrf'], 'data'=>['viewer'=>['id'=>'demo','name'=>$u['name']],'creators'=>(object)$users,'followers'=>$followers,'notifications'=>$notifications,'posts'=>[]],
 'state'=>['balanceCents'=>(int)query('SELECT COALESCE(SUM(amount_cents),0) FROM wallet_ledger WHERE user_id=?',[$u['id']])->fetchColumn(),'profile'=>[],'likes'=>(object)$likes,'following'=>(object)$following,'subscriptions'=>(object)$subscriptions,'comments'=>(object)[],'conversations'=>(object)$conversations,'readNotifications'=>(object)$read],
 'community'=>['email'=>$u['email'],'theme'=>$u['theme'],'password'=>true,'hiddenBadges'=>json_value($u['hidden_badges']),'requests'=>$requests,'stories'=>$stories,'highlights'=>$highlights,'storyLikes'=>(object)$storyLikes,'storySeen'=>(object)$storySeen], 'feed'=>feed($u,$options)];
}
