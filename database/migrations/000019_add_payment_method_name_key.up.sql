CREATE UNIQUE INDEX payment_methods_name_key
    ON payment_methods (lower(btrim(name)));
