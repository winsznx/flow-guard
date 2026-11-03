import { useLocation, useNavigate } from 'react-router-dom';
import { Select } from '../ui/Select';
import { HOME_PATH, WORKSPACE_LABEL, WORKSPACE_NAMES } from '../../copy/nav';
import { useAppMode, type AppMode } from '../../hooks/useAppMode';
import { useWallet } from '../../hooks/useWallet';
import { isOrganizationPath, workspaceForPath } from './chromeRoutes';

const OPTIONS: { value: AppMode; label: string }[] = [
  { value: 'user', label: WORKSPACE_NAMES.user },
  { value: 'dao', label: WORKSPACE_NAMES.dao },
];

export function WorkspaceSwitcher() {
  const { isConnected } = useWallet();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mode = useAppMode((state) => state.mode);
  const pendingMode = useAppMode((state) => state.pendingMode);
  const setMode = useAppMode((state) => state.setMode);
  const saveMode = useAppMode((state) => state.saveMode);

  const shown = workspaceForPath(pathname, isConnected ? mode : (pendingMode ?? mode));

  const onChange = (next: AppMode) => {
    if (!isConnected) {
      setMode(next);
      return;
    }
    saveMode(next);
    if (next === 'user' && isOrganizationPath(pathname)) navigate(HOME_PATH);
  };

  return (
    <Select<AppMode>
      label={WORKSPACE_LABEL}
      name="workspace"
      dense
      options={OPTIONS}
      value={shown}
      onValueChange={onChange}
    />
  );
}
