import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App';

describe('Janus app', () => {
  test('shows janus workspace with disabled design menu', async () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Janus' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Design' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Reaction Setup' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aspiration Plates' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dispensing Plate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preparation Volumes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mapping Files' })).toBeInTheDocument();
  });

  test('blocks mapping export when aspiration plate names are missing', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Add aspiration plate' }));
    await user.click(screen.getByRole('button', { name: 'Generate mapping files' }));

    expect(screen.getByText('Aspiration plate names are required for export.')).toBeInTheDocument();
  });
});
