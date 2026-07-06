import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';
import { EntityFormDialog } from './EntityFormDialog';
import { ToastProvider, useToast } from './Toast';

test('ConfirmDialog renders nothing when closed', () => {
  render(
    <ConfirmDialog open={false} title="Delete?" message="Sure?" onConfirm={vi.fn()} onCancel={vi.fn()} />,
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('ConfirmDialog fires onConfirm and onCancel', async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Delete category"
      message="This also deletes its decks."
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  expect(screen.getByRole('dialog', { name: 'Delete category' })).toBeInTheDocument();
  expect(screen.getByText('This also deletes its decks.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(onConfirm).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledOnce();
});

function ToastTrigger() {
  const { showToast } = useToast();
  return <button onClick={() => showToast('Save failed')}>Trigger</button>;
}

test('showToast displays a toast', async () => {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <ToastTrigger />
    </ToastProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Trigger' }));
  expect(screen.getByRole('status')).toHaveTextContent('Save failed');
});

test('EntityFormDialog disables Save until name is filled and submits trimmed values', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(
    <EntityFormDialog open title="New category" onSubmit={onSubmit} onClose={vi.fn()} />,
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await user.type(screen.getByLabelText('Name'), '  Biology  ');
  await user.type(screen.getByLabelText('Description'), 'Life science');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSubmit).toHaveBeenCalledWith({ name: 'Biology', description: 'Life science' });
});

test('EntityFormDialog prefills initial values for editing', () => {
  render(
    <EntityFormDialog
      open
      title="Edit category"
      initial={{ name: 'Chemistry', description: 'Elements' }}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByLabelText('Name')).toHaveValue('Chemistry');
  expect(screen.getByLabelText('Description')).toHaveValue('Elements');
});
