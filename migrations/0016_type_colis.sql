-- Type d'envoi choisi par le client : document, colis ou alimentaire (repas, produits frais).
ALTER TABLE shipments ADD COLUMN kind TEXT;
