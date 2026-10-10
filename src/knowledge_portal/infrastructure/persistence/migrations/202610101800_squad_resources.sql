-- Phase 1b: a squad holds many resources, each a person (or an open seat) on a system in a
-- role, instead of one person per system. Each existing squad system becomes a system-scoped
-- resource in the "system_contact" role, keeping its person, in the order it was listed.
-- Products need no rewrite: their new offering and portfolio links read as empty.

UPDATE organisation_catalogue
SET payload = jsonb_set(
        payload,
        '{squads}',
        (
            SELECT coalesce(
                jsonb_agg(
                    (squad - 'systems') || jsonb_build_object(
                        'resources',
                        (
                            SELECT coalesce(
                                jsonb_agg(
                                    jsonb_build_object(
                                        'system_id', seat -> 'system_id',
                                        'role', 'system_contact',
                                        'person_id', seat -> 'person_id',
                                        'capability_id', NULL
                                    )
                                    ORDER BY seat_order
                                ),
                                '[]'::jsonb
                            )
                            FROM jsonb_array_elements(coalesce(squad -> 'systems', '[]'::jsonb))
                                WITH ORDINALITY AS seats (seat, seat_order)
                        )
                    )
                    ORDER BY squad_order
                ),
                '[]'::jsonb
            )
            FROM jsonb_array_elements(payload -> 'squads') WITH ORDINALITY AS squads (squad, squad_order)
        )
    ),
    updated_at = now()
WHERE jsonb_typeof(payload -> 'squads') = 'array'
  AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(payload -> 'squads') AS squad WHERE squad ? 'systems'
  );
