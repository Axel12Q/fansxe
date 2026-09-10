<?php
declare(strict_types=1);
function story_available(array $s,array $u): bool {
 if(!readable($s,$u))return false;
 if($s['creator_id']===$u['id'])return true;
 if(row('SELECT 1 FROM highlight_stories WHERE story_id=?',[$s['id']]))return true;
 return strtotime($s['expires_at'])>time() && (bool)row('SELECT 1 FROM follows WHERE follower_id=? AND creator_id=?',[$u['id'],$s['creator_id']]);
}
function story_data(array $s,array $u): array {
 $can=story_available($s,$u);
 $groups=query('SELECT h.id,h.name FROM story_highlights h JOIN highlight_stories hs ON hs.highlight_id=h.id WHERE hs.story_id=? ORDER BY h.created_at,h.id',[$s['id']])->fetchAll();
 return ['id'=>$s['id'],'creatorId'=>client_id($s['creator_id'],$u),'text'=>$can?$s['text']:'','media'=>$can?json_value($s['media']):[],'visibility'=>$s['visibility'],'createdAt'=>timestamp($s['created_at']),'expiresAt'=>timestamp($s['expires_at']),'highlights'=>$groups,'available'=>$can];
}
function send_message(array $u,string $to,string $text,array $media=[],?string $story=null): void {
 $id=uid();query('INSERT INTO messages(id,sender_id,recipient_id,text,media,story_id,story_reply) VALUES(?,?,?,?,?,?,?)',[$id,$u['id'],$to,$text,json_encode($media),$story,$story!==null?1:0]);
 query('INSERT INTO notifications(id,recipient_id,actor_id,kind,text,message_id) VALUES(?,?,?,?,?,?)',[uid(),$to,$u['id'],'message',$story?'respondió a tu historia.':'te envió un mensaje.',$id]);
}
function social_action(string $action,array $d,array $u): bool {
 $id=(string)($d['id']??'');
 if($action==='message-read') {
  $last=row('SELECT * FROM messages WHERE id=? AND sender_id=? AND recipient_id=?',[$d['lastId']??'',$id,$u['id']]);
  if(!$last)return true;
  query('UPDATE messages SET read_at=COALESCE(read_at,NOW()) WHERE recipient_id=? AND sender_id=? AND (created_at<? OR (created_at=? AND id<=?))',[$u['id'],$id,$last['created_at'],$last['created_at'],$last['id']]);
  query('UPDATE notifications n JOIN messages m ON m.id=n.message_id SET n.read_at=COALESCE(n.read_at,NOW()) WHERE n.recipient_id=? AND m.sender_id=? AND m.read_at IS NOT NULL',[$u['id'],$id]);return true;
 }
 if($action==='highlight-delete') {
  query('DELETE FROM story_highlights WHERE id=? AND user_id=?',[$id,$u['id']]);return true;
 }
 $name=str_value($d,'name',40,true);
 $group=$id?row('SELECT * FROM story_highlights WHERE id=? AND user_id=? FOR UPDATE',[$id,$u['id']]):null;
 if($id&&!$group)fail('No puedes editar esta destacada.',403);
 $ids=$d['stories']??[];
 if(!is_array($ids)||count($ids)>100||!count($ids))fail('Selecciona de 1 a 100 historias.');
 $ids=array_unique($ids);
 foreach($ids as $story)if(!is_string($story)||!row('SELECT id FROM stories WHERE id=? AND creator_id=?',[$story,$u['id']]))fail('Selecciona solo tus propias historias.',403);
 if(!$group && query('SELECT COUNT(*) FROM story_highlights WHERE user_id=?',[$u['id']])->fetchColumn()>=30)fail('Puedes crear hasta 30 grupos.');
 $cover=$d['coverAsset']??null;
 if($cover!==null&&$cover!==($group['cover_asset']??null))claim_media([['id'=>$cover]],$u,'profile',1);
 $id=$id?:uid();
 if($group)query('UPDATE story_highlights SET name=?,cover_asset=? WHERE id=?',[$name,$cover,$id]);
 else query('INSERT INTO story_highlights(id,user_id,name,cover_asset) VALUES(?,?,?,?)',[$id,$u['id'],$name,$cover]);
 query('DELETE FROM highlight_stories WHERE highlight_id=?',[$id]);
 foreach($ids as $story)query('INSERT INTO highlight_stories(highlight_id,story_id) VALUES(?,?)',[$id,$story]);
 return true;
}
