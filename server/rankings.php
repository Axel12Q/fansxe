<?php
declare(strict_types=1);
function rankings(): array {
 $creators=query("SELECT u.id,u.name,u.handle,u.avatar_asset avatarAsset,(u.plus_owned OR u.plus_expires_at>NOW()) plus,
 SUM(FLOOR(f.gems*GREATEST(0,p.gross-p.refunded)/GREATEST(1,p.gross))) score
 FROM gem_tips t JOIN users u ON u.id=t.creator_id JOIN gem_tip_funds f ON f.tip_id=t.id
 JOIN billing_payments p ON p.order_id=f.order_id
 WHERE u.role<>'admin' AND p.status='paid' AND p.disputed=0
 GROUP BY u.id HAVING score>0 ORDER BY score DESC,u.id LIMIT 20")->fetchAll();
 $members=query("SELECT u.id,u.name,u.handle,u.avatar_asset avatarAsset,(u.plus_owned OR u.plus_expires_at>NOW()) plus,
 (CASE WHEN u.plus_owned OR u.plus_expires_at>NOW() THEN 50 ELSE 0 END
 +20*(SELECT COUNT(DISTINCT o.creator_id) FROM billing_orders o JOIN billing_payments p ON p.order_id=o.id WHERE o.user_id=u.id AND o.kind='subscription' AND p.status='paid' AND p.disputed=0 AND p.gross>p.refunded)
 +LEAST(100,(SELECT COUNT(*) FROM post_likes l JOIN posts post ON post.id=l.post_id WHERE l.user_id=u.id AND post.creator_id<>u.id))
 +3*LEAST(50,(SELECT COUNT(DISTINCT c.post_id) FROM comments c JOIN posts post ON post.id=c.post_id WHERE c.user_id=u.id AND post.creator_id<>u.id))) score
 FROM users u WHERE u.role<>'admin' HAVING score>0 ORDER BY score DESC,u.id LIMIT 20")->fetchAll();
 return ['creators'=>$creators,'members'=>$members];
}
