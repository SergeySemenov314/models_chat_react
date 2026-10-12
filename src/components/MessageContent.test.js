import { render, screen } from '@testing-library/react';
import MessageContent from './MessageContent';

test('renders a Gemini answer as readable chat content', () => {
  render(<MessageContent content={'**Summary**\n\n* First point\n* Second point\n\nSee [docs](https://example.com).'} />);

  expect(screen.getByText('Summary').tagName).toBe('STRONG');
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://example.com');
  expect(screen.queryByText('**Summary**')).not.toBeInTheDocument();
});

test('renders numbered answers and older Gemini bullet formatting', () => {
  render(<MessageContent content={'1. 1943: McCulloch and Pitts.\n2. 1958: Rosenblatt.\n\n*   **Source:** Text about AI.docx'} />);

  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByText('Source:').tagName).toBe('STRONG');
  expect(screen.queryByText('*   **Source:**')).not.toBeInTheDocument();
});
