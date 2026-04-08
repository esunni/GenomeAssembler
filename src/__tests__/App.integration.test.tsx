import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App';

describe('portal navigation', () => {
  test('opens on the Design page by default', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Design' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Design Workspace' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reaction Setup' })).not.toBeInTheDocument();
  });

  test('uploads a circular FASTA on Design and shows Type IIS site count on the genome map', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.upload(
      screen.getByLabelText('Upload genome FASTA'),
      new File(['>pDemo\nTCTCTTTGGTCTCAAAGAGACCAAGG\n'], 'pDemo.fasta', { type: 'text/plain' }),
    );
    await user.selectOptions(screen.getByLabelText('Type IIS enzyme'), 'bsai-hfv2');

    expect(screen.getByText('Selected file: pDemo.fasta')).toBeInTheDocument();
    expect(screen.getByText('3 sites found')).toBeInTheDocument();
    expect(screen.getByText('GGTCTCn^nnnn_')).toBeInTheDocument();
    expect(screen.queryByText('Sequence name: pDemo')).not.toBeInTheDocument();
    expect(screen.queryByText('Genome length: 26 bp')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Circular genome map for pDemo' })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('25')).toBeInTheDocument();
  });

  test('shows the Build submenu on hover and reveals Janus', async () => {
    const user = userEvent.setup();

    render(<App />);

    const buildNav = screen.getByRole('button', { name: 'Build' });
    await user.hover(buildNav);

    const menu = screen.getByRole('menu', { name: 'Build submenu' });
    expect(within(menu).getByRole('menuitem', { name: 'Janus' })).toBeInTheDocument();
  });

  test('keeps the Build submenu open after click until it is dismissed', async () => {
    const user = userEvent.setup();

    render(<App />);

    const buildNav = screen.getByRole('button', { name: 'Build' });
    await user.click(buildNav);

    expect(screen.getByRole('menu', { name: 'Build submenu' })).toBeInTheDocument();

    const navItem = buildNav.closest('.nav-item');
    expect(navItem).not.toBeNull();

    fireEvent.mouseLeave(navItem!);

    expect(screen.getByRole('menu', { name: 'Build submenu' })).toBeInTheDocument();

    await user.click(document.body);

    expect(screen.queryByRole('menu', { name: 'Build submenu' })).not.toBeInTheDocument();
  });

  test('opens Janus from Design and keeps export validation working', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Open Janus Builder' }));

    expect(screen.getByRole('button', { name: 'Build' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Reaction Setup' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Build' }));
    await user.click(screen.getByRole('menuitem', { name: 'Janus' }));
    await user.click(screen.getByRole('button', { name: 'Add aspiration plate' }));
    await user.click(screen.getByRole('button', { name: 'Generate mapping files' }));

    expect(screen.getByText('Aspiration plate names are required for export.')).toBeInTheDocument();
  });
});
