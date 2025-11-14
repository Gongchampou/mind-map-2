# Brainwave – Visual Mind Mapper
## photo
![GitHub repo size](https://img.shields.io/Gongchampou/mind-map-2?style=flat-square)
https://github.com/Gongchampou/mind-map-2.git
![GitHub stars](https://img.shields.io/Gongchampou/mind-map-2?style=social)
![GitHub forks](https://img.shields.io/github/forks/Gongchampou/mind-map)

A fast, minimal, keyboard‑friendly mind‑mapping app built with Vite and vanilla JavaScript. Supports cloud sync via Supabase.

## Features
- **Create, edit, delete** nodes with titles, URLs, descriptions, and colors
- **Drag & drop** nodes, auto **Tree Layout**, and smooth **zoom/pan**
- **Search** with inline highlighting
- **Lock** nodes to prevent moving
- **Link IDs**: Link any two nodes by their IDs without changing hierarchy; optionally name the line
- **Unlink by IDs**: Remove a custom link between two nodes or detach a descendant branch (ancestor→descendant) from its parent
- **Collapse/Expand branches** to temporarily hide/show children
- **Side-anchored connectors**: All parent→child wires anchor from the appropriate side (including the master/root)
- **20 Node Shapes**: Choose from 20 shapes (including a brain style) in the Add/Edit modal
- **Import/Export** JSON
- **Light/Dark theme** toggle and **mobile menu**
- **Creation History** viewer (grouped by day)
- Optional **Supabase sync** per user

## Requirements
- Node.js 18+ (Node 20/22 recommended)
- npm (bundled with Node)

## Quick Start
- Run in your local machine by opening the terminal and running the following commands:
```bash
git clone https://github.com/Gongchampou/mind-map-2.git
cd mind-map-2
npm install
npm run dev
# Open local host eg: http://localhost:5173
```

### Build & Preview
```bash
npm run build
npm run preview
```

## Supabase (optional, enables editing and sync)
By default you’ll be in Guest mode. In the current configuration, most editing actions are disabled in Guest mode. To enable full functionality and cloud sync, configure Supabase.

### 1) Create a Supabase project
https://supabase.com → New project → Get the Project URL and Anon Key from Project Settings → API.

### 2) Create the `mindmaps` table and policies
Run this SQL in Supabase SQL Editor:

```sql
create table if not exists public.mindmaps (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table public.mindmaps enable row level security;

create policy "select own map"
on public.mindmaps for select
using (auth.uid() = user_id);

create policy "insert own map"
on public.mindmaps for insert
with check (auth.uid() = user_id);

create policy "update own map"
on public.mindmaps for update
using (auth.uid() = user_id);
```

### 3) Add environment variables
Create a file named `.env.local` in the project root with:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Restart the dev server after adding env vars.

## Usage
- **Sign In/Out**: Top‑right. After signing in, your toolbar actions are enabled and your map is synced to Supabase.
- **Add Child**: Button “+ Child” or keys `A` / `+`.
- **Edit**: Button “Edit” or `Ctrl+E`.
- **Delete**: Button “Delete” or `Delete` / `Backspace`.
- **Lock/Unlock**: Lock button or press `L`.
- **Tree Layout**: Auto‑arrange nodes.
- **Center View / Reset Zoom**: Navigation helpers. Always available.
- **Zoom/Pan**: Mouse wheel to zoom; drag background to pan.
- **Open URL**: Double‑click a node with a URL.
- **Collapse/Expand**: Click the small +/- toggle on a node to collapse or expand its children (visible when signed in).
- **Search**: Use the search field (desktop or mobile) to highlight matches.
- **Import/Export JSON**: Export downloads a JSON; Import loads from a JSON file.
- Export/Import preserves any extra links and their labels.
- **Theme**: Sun/Moon button toggles light/dark.
- **layout**: auto fixed it the or flex layout according to the device like mobile, tablet, desktop.
- **Mobile**: Use the hamburger button to open the toolbar.

## Linking & Line Names
- **Link IDs (extra connections)**
  - Click the toolbar button “Link IDs” (available when signed in).
  - Enter the Parent ID and the Child ID (IDs are shown in each node’s card footer as `ID: <value>`).
  - Optionally enter a line name. This creates an additional labeled connector and does not change the existing parent→child relationship.

- **Unlink by IDs (custom link or detach branch)**
  - Click the toolbar button “Unlink” (available when signed in), or open the Link/Unlink dialog and switch to Unlink.
  - Enter two node IDs.
  - Behavior:
    - If a custom link exists specifically between those two IDs (either direction), it is removed.
    - If one node is an ancestor of the other, the descendant subtree is detached from its current parent (root cannot be detached). The parent→child edge label on that connection is cleared.
  - Notes:
    - Other custom links remain in place (only the explicit link between the two IDs is removed).
    - Detaching a branch does not delete any nodes or auto‑assign a new parent; you can re‑link as needed.
    - Lock prevents moving a node but does not currently block linking/unlinking.

- **Parent→child line name on create/edit**
  - In the Add/Edit modal, use the field “Line Name (optional)” to label the connector from the parent to that child.

- **Side-anchored connectors**
  - All parent→child wires anchor from the side facing the child (left/right), including for the master/root node, for clean, professional joins.

- **Export/Import**
  - Extra links and their labels, as well as parent→child line names, are included in JSON export and restored on import.

## Screenshots (placeholders)
Add screenshots to `docs/screenshots/` and keep the filenames below for the README:

<div style="display: grid; grid-template-columns: repeat(1, minmax(0, 1fr)); gap: 6px; max-width: 1000px; margin: 12px 0;">
  <img src="image/README/home.png" alt="Home" style="width:70%; height:70%; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.12);">
</div>

<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; max-width: 1000px; margin: 12px 0;">
  <img src="image/README/tablet.png" alt="Home" style="width:50%; height:100%; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.12);">
  <img src="image/README/branch.png" alt="Toolbar" style="width:50%; height:auto; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.12);">
</div>

<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; max-width: 1000px; margin: 12px 0;">
  <img src="image/README/feature.png" alt="Home" style="width:50%; height:100%; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.12);">
  <img src="image/README/add form.png" alt="Toolbar" style="width:50%; height:70%px; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.12);">
</div>
 --- 
Tips for capturing:
- Use mock content with a few nodes and colors.
- Show both light and dark themes.
- Include a screenshot demonstrating hover highlights and wires.

## Keyboard Shortcuts
- `A` / `+`: Add child
- `Ctrl+E`: Edit selected
- `Delete` / `Backspace`: Delete selected
- `L`: Lock/Unlock selected
- `Esc`: Close auth modal or mobile menu when open

## Troubleshooting
- **Buttons don’t respond**: You’re likely in Guest mode. Configure Supabase and sign in (see above). Check the browser console for a warning: “Supabase environment variables are missing …”.
- **Change port**: `npm run dev -- --port 5174`
- **Access from phone/LAN**: `npm run dev -- --host`
- **Reset local data**: Clear LocalStorage keys starting with `brainwave-mindmap-v2:` in your browser dev tools.
- **Build errors**: Ensure Node 18+ and delete `node_modules` if needed, then `npm install`.

## Missing / Roadmap
- Click‑to‑link/unlink (select nodes or click the line) and a context menu on lines/nodes
- Undo/Redo (current History is view‑only)
- Option to also remove all cross‑subtree custom links when detaching a branch
- Option to prevent linking/unlinking when a node is locked (currently allowed)
- Unique IDs for custom links to support unlinking a specific line by its own ID
- Replace placeholder screenshots under `docs/screenshots/`
- Deployment guide (e.g., Netlify/Vercel) with environment configuration

## Project Structure
```text
.
├─ index.html
├─ main.js
├─ style.css
├─ responsive.css
├─ supabaseClient.js
├─ package.json
├─ package-lock.json
├─ yarn.lock
├─ README.md
├─ .env
├─ .env.local
├─ .gitignore
├─ image/
│  ├─ android-chrome-512x512.png
│  ├─ favicon-32x32.png
│  ├─ favicon.ico
│  └─ README/
│     ├─ home.png
│     ├─ home-1.png
│     ├─ tablet.png
│     ├─ branch.png
│     ├─ feature.png
│     └─ add form.png
├─ dist/                (build output)
│  ├─ index.html
│  └─ assets/
│     ├─ index-BdAvzZbF.css
│     └─ index-CrNb7zOR.js
└─ node_modules/        (installed dependencies)
```

## Tech Stack
- Vite 5
- Vanilla JS, HTML, CSS
- Supabase (optional)
## Support This Project

If you find this project helpful, you can support me through UPI.

[![UPI](https://img.shields.io/badge/UPI-gongchampou9402@oksbi-blue?style=for-the-badge&logo=google-pay)](upi://pay?pa=gongchampou9402@oksbi)