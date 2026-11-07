-- 同一本书在多个路径出现时，只保留路径最短的一条记录
delete from "Book" b using "Book" k
where b.id > k.id
  and b."fileSize" = k."fileSize"
  and b.title = k.title
  and length(b."fileName") > length(k."fileName");
