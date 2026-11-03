import { Button } from './Button';

export type ManageAction = {
  key: string;
  label: string;
  onClick: () => void;
  /** Cancelling and other one-way actions use the danger tone. */
  danger?: boolean;
};

export type ManageActionsProps = { actions: ManageAction[] };

/** The buttons in a detail page's Manage card: stacked and full width at every size, without icons. */
export function ManageActions({ actions }: ManageActionsProps) {
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {actions.map((action) => (
        <Button
          key={action.key}
          variant={action.danger ? 'danger-quiet' : 'secondary'}
          fullWidth
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
