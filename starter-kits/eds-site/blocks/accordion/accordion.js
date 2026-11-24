export default function decorate(block) {
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.append(...(cells[0]?.childNodes ?? []));
    const body = document.createElement('div');
    body.append(...(cells[1]?.childNodes ?? []));
    details.append(summary, body);
    row.replaceWith(details);
  });
  block.dataset.decorated = 'accordion';
}
