-- Livreur écrit par Alefa dans Tsena : seul un livreur choisi par une personne dans Tsena est suivi.
ALTER TABLE tsena_links ADD COLUMN last_driver TEXT;
