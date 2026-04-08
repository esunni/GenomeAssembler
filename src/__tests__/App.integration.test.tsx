import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App';

describe('portal navigation', () => {
  test('opens on the Design page by default', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Design' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Design Workspace' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reaction Setup' })).not.toBeInTheDocument();
  });

  test('shows the Build submenu on hover and reveals Janus', async () => {
    const user = userEvent.setup();

    render(<App />);

    const buildNav = screen.getByRole('button', { name: 'Build' });
    await user.hover(buildNav);

    const menu = screen.getByRole('menu', { name: 'Build submenu' });
    expect(within(menu).getByRole('menuitem', { name: 'Janus' })).toBeInTheDocument();
  });

  test('opens Janus from Design and keeps export validation working', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Open Janus Builder' }));

    expect(screen.getByRole('button', { name: 'Janus' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Reaction Setup' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Build' }));
    await user.click(screen.getByRole('menuitem', { name: 'Janus' }));
    await user.click(screen.getByRole('button', { name: 'Add aspiration plate' }));
    await user.click(screen.getByRole('button', { name: 'Generate mapping files' }));

    expect(screen.getByText('Aspiration plate names are required for export.')).toBeInTheDocument();
  });
});
