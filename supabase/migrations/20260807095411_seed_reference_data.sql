-- Version publique : les noms des personnes ont été anonymisés
-- (« Équipier 01 » à « Équipier 05 »). La migration appliquée en base
-- contient les noms d'origine.
do $$
declare p uuid; z1 uuid; z2 uuid; z3 uuid; z4 uuid;
begin
  select id into p from public.projects where code='24-018';
  insert into public.zones(project_id,code,name,physical_progress) values
    (p,'Z-01','Local électrique',68),(p,'Z-02','Atelier production',61),
    (p,'Z-03','Utilités extérieures',54),(p,'Z-04','Bureaux & locaux sociaux',32)
  on conflict(project_id,code) do nothing;
  select id into z1 from public.zones where project_id=p and code='Z-01';
  select id into z2 from public.zones where project_id=p and code='Z-02';
  select id into z3 from public.zones where project_id=p and code='Z-03';
  select id into z4 from public.zones where project_id=p and code='Z-04';
  insert into public.tasks(project_id,zone_id,code,name,budget_hours) values
    (p,z1,'ETU-01','Études & préparation',320),(p,z2,'CDC-02','Chemins de câbles',560),
    (p,z3,'TIR-03','Tirage de câbles',980),(p,z1,'RAC-04','Raccordements BT',720),
    (p,z2,'ESS-05','Essais & mise en service',280)
  on conflict(project_id,code) do nothing;
  insert into public.people(project_id,full_name,qualification,contract_type,coefficient) values
    (p,'Équipier 01','Chef d’équipe','interne',null),(p,'Équipier 02','Électricien N3P2','interne',null),
    (p,'Équipier 03','Électricien','interimaire','190'),(p,'Équipier 04','Monteur-câbleur','interimaire','170'),
    (p,'Équipier 05','Électricien N2','interne',null);
  insert into public.stock_items(project_id,reference,name,category,unit,ordered_quantity,received_quantity,minimum_quantity) values
    (p,'CAB-4G25','Câble U1000 R2V 4G25','Câbles','m',1200,800,180),
    (p,'CDC-300','Chemin de câble 300×60','Chemins de câble','ml',460,460,60),
    (p,'LUM-LED','Luminaire LED étanche 48 W','Luminaires','u',180,120,25),
    (p,'RAIL-41','Rail supportage 41×41 · 3 m','Supportage','u',240,240,30),
    (p,'BOUL-M8','Boulonnerie M8 zinguée','Boulonnerie','boîte',40,32,8),
    (p,'COL-200','Colliers nylon 200×4,8','Colliers','paquet',80,80,15)
  on conflict(project_id,reference) do nothing;
end $$;
