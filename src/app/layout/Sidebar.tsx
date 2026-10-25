import { NavLink } from 'react-router-dom';
import { useCampaign } from '../CampaignContext';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/sessions', label: 'Sessions' },
  { to: '/quests', label: 'Quests' },
  { to: '/npcs', label: 'NPC Codex' },
];

export function Sidebar() {
  const campaign = useCampaign();
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">Questkeeper</div>
      <div className="sidebar__campaign">
        <span className="sidebar__label">Campaign</span>
        {campaign.name}
      </div>
      <nav className="sidebar__nav" aria-label="Main">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              'sidebar__link' + (isActive ? ' sidebar__link--active' : '')
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
