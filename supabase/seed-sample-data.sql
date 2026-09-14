-- ============================================================================
-- SAMPLE DATA — FAKE. FOR LOOKING AT THE UI ONLY.
--
-- Every report, name, place and figure below is invented. None of it describes
-- a real person, a real allegation, or a real event.
--
-- Run it in the Supabase SQL editor after 0001_init.sql.
--
-- ---------------------------------------------------------------------------
-- TO DELETE ALL OF IT AGAIN — run this one line:
--
--     delete from public.reports where source_meta->>'seeded' = 'true';
--
-- Every seeded row is tagged, so that removes the sample data and nothing else.
-- Attachments and audit events are removed with it by cascade.
-- ---------------------------------------------------------------------------
--
-- DO NOT run this against a database that holds real reports. Mixing invented
-- allegations into a live register is not something you can reliably undo by
-- eye, and the names below are deliberately initials and roles rather than full
-- names so that nothing here can be mistaken for an accusation against anyone.
-- ============================================================================

do $$
declare
  -- How many reports to create. Change this and re-run for more or fewer.
  n_reports  int := 80;

  -- Kecamatan and kabupaten, held as parallel arrays so the pair always matches.
  kecamatans text[] := array[
    'Pahandut','Jekan Raya','Sabangau','Bukit Batu',
    'Arut Selatan','Kumai',
    'Mentawa Baru Ketapang','Baamang',
    'Selat','Basarang',
    'Katingan Hilir','Kahayan Hilir',
    'Dusun Selatan','Teweh Tengah','Kurun','Seruyan Hilir'
  ];
  kabupatens text[] := array[
    'Kota Palangka Raya','Kota Palangka Raya','Kota Palangka Raya','Kota Palangka Raya',
    'Kotawaringin Barat','Kotawaringin Barat',
    'Kotawaringin Timur','Kotawaringin Timur',
    'Kapuas','Kapuas',
    'Katingan','Pulang Pisau',
    'Barito Selatan','Barito Utara','Gunung Mas','Seruyan'
  ];

  desas text[] := array[
    'Kalampangan','Sabaru','Bereng Bengkel','Tumbang Rungan','Marang',
    'Petuk Katimpun','Tanjung Pinang','Bukit Tunggal','Danau Tundai','Habaring Hurung'
  ];

  -- Category buckets, with the free text an intake might actually have sent.
  cat_keys text[] := array[
    'politik_uang','intimidasi_kekerasan','penyalahgunaan_fasilitas',
    'pelanggaran_kampanye','pelanggaran_pemungutan','kode_etik'
  ];
  cat_raws text[] := array[
    'politik uang','intimidasi','penyalahgunaan fasilitas negara',
    'pelanggaran kampanye','pelanggaran pemungutan suara','kode etik penyelenggara'
  ];

  narr_money text[] := array[
    'Ada pembagian uang tunai kepada warga pada malam hari menjelang pemungutan suara, disertai permintaan memilih calon tertentu.',
    'Warga menerima amplop berisi uang di sekitar balai RT setelah kegiatan pengajian.',
    'Sembako dibagikan oleh sekelompok orang sambil menyebut nomor urut calon.',
    'Terjadi pembagian uang pada dini hari di beberapa rumah warga di satu RT.',
    'Beberapa warga mengaku dijanjikan uang transport apabila hadir dan memilih calon tertentu.'
  ];
  narr_intim text[] := array[
    'Pelapor mengaku diancam akan kehilangan pekerjaan apabila tidak memilih calon tertentu.',
    'Ada tekanan dari atasan agar seluruh karyawan memilih calon yang sama.',
    'Warga didatangi dan diperingatkan agar tidak menghadiri kegiatan calon lain.',
    'Sekelompok orang tidak dikenal mendatangi rumah warga dan meminta menurunkan atribut calon tertentu.'
  ];
  narr_fasil text[] := array[
    'Kendaraan dinas diduga digunakan untuk mengangkut peserta kegiatan kampanye.',
    'Kegiatan kampanye digelar di balai desa pada jam kerja.',
    'Perangkat desa diduga mengarahkan warga untuk memilih calon tertentu dalam pertemuan resmi.',
    'Bantuan sosial diduga disalurkan bersamaan dengan kegiatan kampanye.'
  ];
  narr_kamp text[] := array[
    'Alat peraga kampanye masih terpasang di beberapa titik pada masa tenang.',
    'Kegiatan kampanye diduga dilakukan di lingkungan tempat ibadah.',
    'Beredar konten kampanye yang memuat ujaran kebencian berbasis SARA.',
    'Anak di bawah umur diduga dilibatkan dalam konvoi kampanye.',
    'Kampanye diduga dilakukan di luar jadwal yang ditetapkan.'
  ];
  narr_pemungutan text[] := array[
    'Ada dugaan pemilih mencoblos lebih dari satu kali di satu TPS.',
    'Saksi salah satu calon diduga diminta meninggalkan ruang penghitungan.',
    'Terdapat selisih angka antara formulir hasil dan rekapitulasi.',
    'Ada dugaan pemilih terdaftar ganda pada daftar pemilih.'
  ];
  narr_etik text[] := array[
    'Anggota penyelenggara diduga menunjukkan keberpihakan kepada salah satu calon di media sosial.',
    'Penyelenggara diduga menghadiri kegiatan internal salah satu peserta pemilu.',
    'Ada dugaan konflik kepentingan pada salah satu anggota penyelenggara di tingkat kecamatan.'
  ];

  -- Initials and roles rather than full names: realistic in a chart, but not
  -- capable of being read as an accusation against an identifiable person.
  terlapors text[] := array[
    'Pak D.','Bu R.','Saudara A.','Pak Y.','Bu S.',
    'Tim sukses wilayah utara','Tim sukses wilayah selatan',
    'Oknum perangkat desa','Oknum ASN kecamatan','Sekelompok orang tidak dikenal'
  ];
  peran text[] := array[
    'tim sukses','perangkat desa','ASN','relawan','tidak diketahui','pengurus RT'
  ];

  pelapors text[] := array[
    'Budi S.','Siti A.','Ahmad F.','Ratna W.','Joko P.','Dewi K.','Hendra M.','Lilis N.'
  ];

  waktu text[] := array[
    'kemarin malam','tadi pagi','sekitar habis isya','dua hari lalu',
    'minggu lalu','sekitar pukul 8 malam','saat menjelang subuh'
  ];

  barang text[] := array['uang tunai','sembako','amplop','voucher belanja','paket bahan pokok'];

  bukti_notes text[] := array[
    'Ada foto amplop yang dibagikan.',
    'Rekaman video pendek dari warga.',
    'Tangkapan layar percakapan grup.',
    'Beberapa warga bersedia menjadi saksi.'
  ];

  statuses text[] := array['ditinjau','diteruskan','ditutup','bukan_pelanggaran','duplikat'];

  sample_warnings text[] := array[
    'Kategori tidak dikenali, dipakai lainnya.',
    'Tanggal kejadian tidak dapat dibaca.',
    'witness_count: Nilai bukan angka.'
  ];

  -- per-row working values
  i           int;
  loc_i       int;
  cat_i       int;
  narr_pool   text[];
  v_created   timestamptz;
  v_incident  timestamptz;
  v_status    text;
  v_priority  text;
  v_identity  boolean;
  v_evidence  boolean;
  v_value     numeric;
  v_warnings  text[];
  v_id        uuid;
  age_days    numeric;
begin
  for i in 1..n_reports loop
    loc_i := 1 + floor(random() * array_length(kecamatans, 1))::int;
    cat_i := 1 + floor(random() * array_length(cat_keys, 1))::int;

    narr_pool := case cat_i
      when 1 then narr_money
      when 2 then narr_intim
      when 3 then narr_fasil
      when 4 then narr_kamp
      when 5 then narr_pemungutan
      else narr_etik
    end;

    -- Spread across the last 60 days.
    age_days  := random() * 60;
    v_created := now() - (age_days || ' days')::interval;

    -- The incident usually predates the report by a day or two.
    v_incident := case when random() < 0.65
      then v_created - ((random() * 3) || ' days')::interval
      else null
    end;

    -- Older reports are more likely to have been worked already.
    v_status := case when age_days > 7 and random() < 0.7
      then statuses[1 + floor(random() * array_length(statuses, 1))::int]
      else 'baru'
    end;

    v_priority := case when random() < 0.30 then 'urgent' else 'normal' end;
    v_identity := random() < 0.40;
    v_evidence := random() < 0.45;

    -- Only some money-politics reports carry a figure. That gap is deliberate:
    -- it is what the "Estimasi nilai" denominator on the dashboard exists to
    -- show, and a seed where every row had a value would hide the point.
    v_value := case when cat_i = 1 and random() < 0.55
      then (round((20000 + random() * 280000) / 5000) * 5000)::numeric
      else null
    end;

    v_warnings := case when random() < 0.15
      then array[sample_warnings[1 + floor(random() * array_length(sample_warnings, 1))::int]]
      else '{}'::text[]
    end;

    insert into public.reports (
      created_at, status, priority,
      narrative, incident_at, incident_at_text,
      location_text, desa, kecamatan, kabupaten, provinsi,
      reported_party, reported_party_role,
      category, category_raw,
      item_given, item_value, recipients_estimate, witness_count,
      identity_disclosed, reporter_name, reporter_address, reporter_contact,
      has_evidence, evidence_note,
      parse_warnings, source, source_meta
    ) values (
      v_created,
      v_status,
      v_priority,
      narr_pool[1 + floor(random() * array_length(narr_pool, 1))::int],
      v_incident,
      case when random() < 0.7
        then waktu[1 + floor(random() * array_length(waktu, 1))::int]
        else null end,
      case when random() < 0.5
        then 'Sekitar RT 0' || (1 + floor(random() * 8))::int
        else null end,
      case when random() < 0.8
        then desas[1 + floor(random() * array_length(desas, 1))::int]
        else null end,
      kecamatans[loc_i],
      kabupatens[loc_i],
      'Kalimantan Tengah',
      case when random() < 0.65
        then terlapors[1 + floor(random() * array_length(terlapors, 1))::int]
        else null end,
      case when random() < 0.40
        then peran[1 + floor(random() * array_length(peran, 1))::int]
        else null end,
      cat_keys[cat_i],
      cat_raws[cat_i],
      case when cat_i = 1 and random() < 0.75
        then barang[1 + floor(random() * array_length(barang, 1))::int]
        else null end,
      v_value,
      case when cat_i = 1 and v_value is not null
        then (5 + floor(random() * 115))::int
        else null end,
      case when random() < 0.5 then (1 + floor(random() * 12))::int else null end,
      v_identity,
      case when v_identity
        then pelapors[1 + floor(random() * array_length(pelapors, 1))::int]
        else null end,
      case when v_identity
        then desas[1 + floor(random() * array_length(desas, 1))::int] || ', ' || kecamatans[loc_i]
        else null end,
      case when v_identity then '08xxxxxxxxxx' else null end,
      v_evidence,
      case when v_evidence
        then bukti_notes[1 + floor(random() * array_length(bukti_notes, 1))::int]
        else null end,
      v_warnings,
      (array['web','whatsapp','api','manual'])[1 + floor(random() * 4)::int],
      jsonb_build_object('seeded', true, 'sample_data', true)
    )
    returning id into v_id;

    -- Audit trail: every report was created, and the ones that moved on have a
    -- status change too, so the "Kecepatan tindak lanjut" panel has something
    -- real to take a median of instead of showing nothing.
    insert into public.report_events (report_id, event_type, to_value, created_at, detail)
    values (v_id, 'created', 'baru', v_created, jsonb_build_object('source', 'seed'));

    if v_status <> 'baru' then
      insert into public.report_events (
        report_id, event_type, from_value, to_value, created_at, detail
      ) values (
        v_id,
        'status_changed',
        'baru',
        v_status,
        v_created + ((0.5 + random() * 72) || ' hours')::interval,
        jsonb_build_object('source', 'seed')
      );
    end if;
  end loop;

  raise notice 'Selesai. % laporan contoh dibuat.', n_reports;
end $$;

-- ---------------------------------------------------------------------------
-- Check what landed.
-- ---------------------------------------------------------------------------
select
  count(*)                                             as total,
  count(*) filter (where priority = 'urgent')          as urgent,
  count(*) filter (where identity_disclosed)           as dengan_identitas,
  count(*) filter (where report_class = 'laporan')     as laporan_resmi,
  count(*) filter (where status = 'baru')              as belum_ditinjau,
  round(avg(completeness))                             as rata_kelengkapan
from public.reports
where source_meta->>'seeded' = 'true';

select category, count(*) as jumlah
from public.reports
where source_meta->>'seeded' = 'true'
group by category
order by jumlah desc;
