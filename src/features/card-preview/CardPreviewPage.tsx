import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useCard, useCategory, useDeck } from '../../api/hooks';
import { Breadcrumbs, type Crumb } from '../../components/Breadcrumbs';
import { buttonClassName } from '../../components/Button';
import { CardViewer } from '../../components/CardViewer';
import { ErrorBanner } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';

export function CardPreviewPage() {
  const { cardId } = useParams<{ cardId: string }>();
  // A different card always opens on its question side.
  return <CardPreview key={cardId} cardId={cardId} />;
}

function CardPreview({ cardId }: { cardId: string | undefined }) {
  const card = useCard(cardId);
  const deck = useDeck(card.data?.deckID);
  const category = useCategory(deck.data?.categoryID);
  const [flipped, setFlipped] = useState(false);

  if (card.isPending) return <PageLoading />;
  if (card.isError) return <ErrorBanner error={card.error} onRetry={() => card.refetch()} />;

  const crumbs: Crumb[] = [{ label: 'Home', to: '/' }];
  if (category.data) {
    crumbs.push({ label: category.data.name, to: `/categories/${category.data.id}` });
  }
  if (deck.data) {
    crumbs.push({ label: deck.data.name, to: `/decks/${deck.data.id}` });
  }
  crumbs.push({ label: 'View card' });

  return (
    <div>
      <Breadcrumbs items={crumbs} />
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold">View card</h1>
          <Link to={`/cards/${card.data.id}/edit`} className={buttonClassName('primary')}>
            Edit
          </Link>
        </div>
        <CardViewer card={card.data} flipped={flipped} onFlip={() => setFlipped(value => !value)} />
      </div>
    </div>
  );
}
