import * as XLSX from 'xlsx';

/**
 * Parse a CSV or Excel file into a team capacity config object.
 * Extracted verbatim from plan-schedule.js: handleEmployeeFileUpload()
 *
 * @param {File} file
 * @returns {Promise<{ teamConfig: object, summary: string }>}
 */
export function parseEmployeeFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function (evt) {
      try {
        let rows = [];

        if (file.name.endsWith('.csv')) {
          const text = new TextDecoder().decode(evt.target.result);
          const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
          if (lines.length > 1) {
            const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
              const row = {};
              headers.forEach((h, idx) => {
                row[h] = cols[idx] || '';
              });
              rows.push(row);
            }
          }
        } else {
          const workbook = XLSX.read(evt.target.result, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          rows = XLSX.utils.sheet_to_json(sheet);
        }

        let nameKey = null, skillKey = null, statusKey = null;
        if (rows.length > 0) {
          const keys = Object.keys(rows[0]);
          keys.forEach((k) => {
            const kl = k.toLowerCase();
            if (kl.includes('name')) nameKey = k;
            else if (kl.includes('skill') || kl.includes('role')) skillKey = k;
            else if (kl.includes('status') || kl.includes('avail') || kl.includes('project') || kl.includes('free')) statusKey = k;
          });
        }

        if (!nameKey || !skillKey || !statusKey) {
          throw new Error('Required columns (Name, Skill, Status) could not be identified in the sheet.');
        }

        const roles = ['backend', 'frontend', 'qa', 'devops'];
        const membersByRole = { backend: [], frontend: [], qa: [], devops: [] };

        rows.forEach((r) => {
          const name = String(r[nameKey] || '').trim();
          const skill = String(r[skillKey] || '').trim().toLowerCase();
          const status = String(r[statusKey] || '').trim().toLowerCase();

          if (name && status === 'free') {
            roles.forEach((role) => {
              if (skill.includes(role)) {
                membersByRole[role].push(name);
              }
            });
          }
        });

        const rolesPayload = [];
        let totalSize = 0;
        roles.forEach((role) => {
          const list = membersByRole[role];
          const count = list.length > 0 ? list.length : 1;
          const members = list.length > 0 ? list : [role + '_default_1'];
          totalSize += count;
          rolesPayload.push({
            role,
            count,
            hours_per_day_per_person: 8.0,
            members,
          });
        });

        const teamConfig = {
          team_size: totalSize,
          roles: rolesPayload,
        };

        const summary = `✓ Allocated ${totalSize} free employee(s) (Backend: ${membersByRole.backend.length}, Frontend: ${membersByRole.frontend.length}, QA: ${membersByRole.qa.length}, DevOps: ${membersByRole.devops.length})`;

        resolve({ teamConfig, summary });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));

    if (file.name.endsWith('.csv')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsBinaryString(file);
    }
  });
}
