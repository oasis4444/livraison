-- Statut Alefa affiché dans Tsena (ajouté à la note de la livraison, la note d'origine est conservée).
ALTER TABLE tsena_links ADD COLUMN base_note TEXT;
UPDATE tsena_links SET last_step = NULL;
