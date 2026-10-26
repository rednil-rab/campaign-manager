import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useCampaignStore } from '../../store/campaignStore';

// Relative targets resolve against the /c/:campaignId route this renders in.
const links = [
  { to: '.', label: 'Dashboard', end: true },
  { to: 'sessions', label: 'Sessions' },
  { to: 'quests', label: 'Quests' },
  { to: 'characters', label: 'Characters' },
  { to: 'npcs', label: 'NPC Codex' },
  { to: 'stats', label: 'Stats' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const order = useCampaignStore((s) => s.order);
  const campaigns = useCampaignStore((s) => s.campaigns);
  const activeId = useCampaignStore((s) => s.activeCampaignId);

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">Questkeeper</div>
      <div className="sidebar__campaign">
        <label className="sidebar__label" htmlFor="campaign-switcher">
          Campaign
        </label>
        <select
          id="campaign-switcher"
          className="input"
          value={activeId ?? ''}
          onChange={(e) => navigate(`/c/${e.target.value}`)}
        >
          {order.map((id) => (
            <option key={id} value={id}>
              {campaigns[id].name}
            </option>
          ))}
        </select>
        <Link className="sidebar__all" to="/">
          All campaigns
        </Link>
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
