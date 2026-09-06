<?php
declare(strict_types=1);
function feed(array $u,array $options=[]): array {
 $where=[]; $args=[]; $profile=real_id((string)($options['profile']??''),$u); $filter=$options['filter']??'todo';
 if($profile) { $where[]='p.creator_id=?'; $args[]=$profile; }
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
  $posts[]=['id'=>$p['id'],'creatorId'=>client_id($p['creator_id'],$u),'text'=>$can?$p['text']:'Contenido exclusivo para suscriptores.','media'=>$media,'visibility'=>$p['visibility'],'type'=>in_array('video',array_column($media,'kind'),true)?'videos':($media?'fotos':'texto'),'label'=>date('d/m/Y H:i',strtotime($p['created_at'])),'createdAt'=>$p['created_at'],
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
  $id=client_id($r['id'],$u); $users[$id]=['id'=>$id,'name'=>$r['name'],'handle'=>$r['handle'],'bio'=>$r['bio'],'location'=>$r['location'],'avatarAsset'=>$r['avatar_asset'],'coverAsset'=>$r['cover_asset'],'followers'=>(int)$r['followers']-(!empty($following[$id])?1:0),'subscriptionCents'=>499,'verified'=>false,'hiddenBadges'=>json_value($r['hidden_badges']),'postCount'=>(int)$r['post_count'],'firstPost'=>(bool)$r['first_post'],'firstStory'=>(bool)$r['first_story']];
 }
 $likes=[]; foreach(query('SELECT post_id FROM post_likes WHERE user_id=?',[$u['id']]) as $r) $likes[$r['post_id']]=true;
 $subscriptions=[]; foreach(query('SELECT creator_id FROM subscriptions WHERE user_id=? AND expires_at>NOW()',[$u['id']]) as $r) $subscriptions[client_id($r['creator_id'],$u)]=true;
 $conversations=[];
 foreach(query('SELECT * FROM messages WHERE sender_id=? OR recipient_id=? ORDER BY created_at,id',[$u['id'],$u['id']]) as $r) {
  $id=$r['sender_id']===$u['id']?$r['recipient_id']:$r['sender_id']; $conversations[$id]??=['userId'=>$id,'messages'=>[]];
  $conversations[$id]['messages'][]=['id'=>$r['id'],'senderId'=>client_id($r['sender_id'],$u),'text'=>$r['text'],'media'=>json_value($r['media']),'createdAt'=>$r['created_at']];
 }
 $notifications=[];$read=[];
 foreach(query('SELECT * FROM notifications WHERE recipient_id=? ORDER BY created_at DESC LIMIT 100',[$u['id']]) as $r) { $notifications[]=['id'=>$r['id'],'userId'=>client_id($r['actor_id'],$u),'kind'=>$r['kind'],'text'=>$r['text'],'time'=>date('d/m/Y H:i',strtotime($r['created_at']))]; if($r['read_at']) $read[$r['id']]=true; }
 $requests=[];
 foreach(query('SELECT * FROM age_requests'.($u['role']==='admin'?'':' WHERE user_id=?').' ORDER BY submitted_at,id',$u['role']==='admin'?[]:[$u['id']]) as $r) $requests[]=['id'=>$r['id'],'userId'=>client_id($r['user_id'],$u),'document'=>media_data($r['document_id']),'status'=>$r['status'],'note'=>$r['note'],'submittedAt'=>timestamp($r['submitted_at']),'reviewedAt'=>$r['reviewed_at']?timestamp($r['reviewed_at']):null];
 $stories=[]; $storyLikes=[];$storySeen=[];
 foreach(query('SELECT s.* FROM stories s WHERE expires_at>NOW() AND (creator_id=? OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=? AND f.creator_id=s.creator_id)) ORDER BY created_at,id',[$u['id'],$u['id']]) as $r) {
  $can=readable($r,$u); $stories[]=['id'=>$r['id'],'creatorId'=>client_id($r['creator_id'],$u),'text'=>$can?$r['text']:'','media'=>$can?json_value($r['media']):[],'visibility'=>$r['visibility'],'createdAt'=>timestamp($r['created_at']),'expiresAt'=>timestamp($r['expires_at'])];
 }
 foreach(query('SELECT * FROM story_reactions WHERE user_id=?',[$u['id']]) as $r) {if($r['liked'])$storyLikes[$r['story_id']]=true; if($r['seen'])$storySeen[$r['story_id']]=true;}
 return ['selfId'=>$u['id'],'session'=>['email'=>$u['email'],'name'=>$u['name'],'role'=>$u['role']], 'csrf'=>$_SESSION['csrf'], 'data'=>['viewer'=>['id'=>'demo','name'=>$u['name']],'creators'=>(object)$users,'followers'=>$followers,'notifications'=>$notifications,'posts'=>[]],
 'state'=>['balanceCents'=>(int)query('SELECT COALESCE(SUM(amount_cents),0) FROM wallet_ledger WHERE user_id=?',[$u['id']])->fetchColumn(),'profile'=>[],'likes'=>(object)$likes,'following'=>(object)$following,'subscriptions'=>(object)$subscriptions,'comments'=>(object)[],'conversations'=>(object)$conversations,'readNotifications'=>(object)$read],
 'community'=>['email'=>$u['email'],'theme'=>$u['theme'],'password'=>true,'hiddenBadges'=>json_value($u['hidden_badges']),'requests'=>$requests,'stories'=>$stories,'storyLikes'=>(object)$storyLikes,'storySeen'=>(object)$storySeen], 'feed'=>feed($u,$options)];
}
