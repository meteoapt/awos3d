# AWOS 3D WebGIS — Stamet APT Pranoto

Standalone starter: Next.js App Router + CesiumJS + API backend. The three coordinates are estimates supplied by the user and must be verified before any operational use.

## Requirements
- Windows 10/11
- Node.js 20.9+ recommended by current Next.js installation docs
- Access from the app host to `http://192.168.5.2`
- Network permission/firewall approval for LAN clients

## Install
1. Extract the ZIP.
2. Open the extracted folder in VS Code.
3. Copy `.env.local.example` to `.env.local`.
4. Check the AWOS URL, file prefix and filename format in `.env.local`.
5. In VS Code Terminal:
   ```powershell
   npm install
   npm run dev
   ```
6. Open `http://localhost:3000`.

For access from other LAN computers, run:
```powershell
npm run build
npm run start
```
Then open `http://IP-KOMPUTER-SERVER:3000` from other computers. Find the server IP with `ipconfig`. Allow inbound TCP port 3000 only on the trusted BMKG private network, with IT/network administrator approval.

## Important parser note
The supplied screenshot has a multi-row header and blank cells. The route first attempts to parse HTML table cells with Cheerio, preserving empty cells. If the AWOS endpoint returns preformatted text or whitespace-collapsed HTML, column offsets can be ambiguous. The API will return an error rather than safely guessing in some cases, but you must verify actual output from the server. Inspect `/api/awos` and compare at least 10 timestamps with the AWOS page/manual before relying on it. Exact SKY/PW/lightning positions may require a fixed-width parser tuned to the logger output.

## Notes
- The 3D map uses an ellipsoid globe, OSM imagery tiles and a runway-axis polyline from the three estimated points. This is a true interactive 3D globe view, but not yet a photorealistic 3D airport model or terrain dataset.
- OSM imagery needs internet access from each browser unless you configure an approved internal tile service.
- QFF/QFE are not present as explicit fields in the sample header; they are not fabricated.
- Data refresh runs every 60 seconds. A failed fetch displays an error; verify stale-data handling and parser accuracy before production.
- Never expose the internal AWOS URL to public internet. Do not port-forward this app externally. Coordinate with IT for firewall, access control and a production service account.
