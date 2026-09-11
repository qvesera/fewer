-- 0027_content_pages_card_copy_reseed.sql
--
-- Bring already-seeded environments in line with the docs copy rename.
--
-- 0021_content_pages.sql seeds the docs pages, and the v0.7.0 release renamed
-- user-facing "Nodes" labels to "Cards" in that seed (matching the in-repo
-- markdown under content/docs/, which is the source of the copy). 0021 had
-- already been applied, so the migration runner never re-seeded those rows and
-- production still serves the old wording (including the editing page's title).
--
-- 0021 remains the source of record for fresh installs; this migration updates
-- the rows in environments where the seed has already run.
--
-- The rename was exhaustive and 1:1 in 0021 (every occurrence of each phrase
-- was renamed, with no intentional survivors — e.g. "Node Types" and "node's
-- output handle" are deliberately unchanged), so a phrase-scoped replace
-- reproduces exactly what the seed now contains.
--
-- Idempotent: after the first run each pattern is absent and the statements
-- match no rows.

-- The editing page's title (a column, not page copy).
update public.content_pages
   set title = 'Editing Cards'
 where type = 'docs'
   and slug = 'editing'
   and title = 'Editing Nodes';

update public.content_pages
   set content = replace(content, 'Hidden Nodes', 'Hidden Cards')
 where type = 'docs' and content like '%Hidden Nodes%';

update public.content_pages
   set content = replace(content, 'Editing Nodes', 'Editing Cards')
 where type = 'docs' and content like '%Editing Nodes%';

update public.content_pages
   set content = replace(content, '## Adding Nodes', '## Adding Cards')
 where type = 'docs' and content like '%## Adding Nodes%';

update public.content_pages
   set content = replace(content, '## Connecting Nodes', '## Connecting Cards')
 where type = 'docs' and content like '%## Connecting Nodes%';

update public.content_pages
   set content = replace(content, 'Include File Nodes', 'Include File Cards')
 where type = 'docs' and content like '%Include File Nodes%';

update public.content_pages
   set content = replace(content, 'Show All Nodes', 'Show All Cards')
 where type = 'docs' and content like '%Show All Nodes%';

update public.content_pages
   set content = replace(content, '- Nodes, edges, and their positions', '- Cards, edges, and their positions')
 where type = 'docs' and content like '%- Nodes, edges, and their positions%';
