import { useEffect, useState, useCallback } from "react";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  List,
  Link,
  InlineStack,
  TextField,
  Image,
  Select,
  Divider,
  Badge,
  Form,
  FormLayout,
  Icon,
  MediaCard,
  VideoThumbnail,
  Modal,
} from "@shopify/polaris";
import { COMMISSION, COUPON_PCT, MONTHLY_COMMISSION_PLAN, authenticate } from "../shopify.server";
import { getStore } from "~/models/store.server";
import { updateDiscountPercentage } from "~/utils/discountUtil.server";
import { getSubscriptionLineItemId } from "~/utils/subscriptionUtil.server";
import { getDateTimeXDaysFromNow } from "./applyCoupon";
import db from "../db.server"

// const COMMISSION = .05;

export const loader = async ({ request }) => {
  const { billing, admin, session, redirect} = await authenticate.admin(request);
  const { shop } = session;

  const isDevelopmentStore = (shop === 'quickstart-9f306b3f.myshopify.com');

  // Check for billing
  const billingCheck = await billing.require({
    plans: [MONTHLY_COMMISSION_PLAN],
    isTest: isDevelopmentStore,
    onFailure: () => redirect('/app/billingSetUp'),
  });
  // Initiate and/or retrieve store data from database
  const store = await getStore(session.shop, session.id, admin.graphql);
  // First time billing set up
  if (billingCheck && billingCheck.appSubscriptions && billingCheck.appSubscriptions.length > 0) {
    const subscription = billingCheck.appSubscriptions[0];
    console.log("Billing check: " + JSON.stringify(billingCheck));
    console.log(`Shop is on ${subscription.name} (id ${subscription.id})`);
    if (!store.billingId) {
      const billingId = await getSubscriptionLineItemId(subscription.id, admin.graphql);
      store.billingId = billingId;
      store.nextPeriod = getDateTimeXDaysFromNow(30);
      await db.store.update({
        where: {
          shop: store.shop
        },
        data: {
          billingId: store.billingId,
          nextPeriod: store.nextPeriod
        },
      });
    }
  } else {
    console.log(`No app subscriptions found`);
  }

  const uuid = process.env.SHOPIFY_POP_GAMES_EXTENSION_ID;

  return json({ store, COMMISSION, COUPON_PCT, uuid });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;
  const body = await request.text();
  const data = new URLSearchParams(body);
  const lowPctOff = parseFloat(data.get('lowPctOff'));
  const midPctOff = parseFloat(data.get('midPctOff'));
  const highPctOff = parseFloat(data.get('highPctOff'));
  const lowProb = parseFloat(data.get('lowProb'));
  const midProb = parseFloat(data.get('midProb'));
  const highProb = parseFloat(data.get('highProb'));
  const useWordGame = data.get('useWordGame');
  const useBirdGame = data.get('useBirdGame');

  const store = await db.store.findUnique({ where: { shop: shop }});

  if (store == null) {
    return null;
  }

  let success = true;
  let message = "Updated successfully";

  if (useWordGame != null) {
    store.useWordGame = (useWordGame === 'true');
  }

  if (useBirdGame != null) {
    store.useBirdGame = (useBirdGame === 'true');
  }

  if (lowProb + midProb + highProb == 1) {
    if (store.lowProb != lowProb) {
      store.lowProb = lowProb;
    }
    if (store.midProb != midProb) {
      store.midProb = midProb;
    }
    if (store.highProb != highProb) {
      store.highProb = highProb;
    }
  } else {
    success = false;
    message = "Probabilities must add up to 100";
  }

  if (lowPctOff < midPctOff && midPctOff < highPctOff) {
    if (success != false) {
      if (store.lowPctOff != lowPctOff) {
        success = await updateDiscountPercentage(store.lowDiscountId, lowPctOff, admin.graphql);
        store.lowPctOff = lowPctOff;
      }
    
      if (store.midPctOff != midPctOff) {
        success = await updateDiscountPercentage(store.midDiscountId, midPctOff, admin.graphql) && success;
        store.midPctOff = midPctOff;
      }
    
      if (store.highPctOff != highPctOff) {
        success = await updateDiscountPercentage(store.highDiscountId, highPctOff, admin.graphql) && success;
        store.highPctOff = highPctOff;
      }
  
      if (success == false) {
        message = "Update failed";
      } else {
        await db.store.update({ where: { shop: shop }, data: { ...store }});
      }
    }
  } else {
    success = false;
    message = "Higher tier discounts must provide a larger percentage off than the tiers below them"
  }

  return json({
    success,
    message
  });
};

export default function Index() {
  const nav = useNavigation();
  const actionData = useActionData();
  const submit = useSubmit();
  const loaderData = useLoaderData();
  const store = loaderData?.store;
  const commission = loaderData?.COMMISSION;
  const couponPct = loaderData?.COUPON_PCT;
  const uuid = loaderData?.uuid;
  const lowPctOff = store.lowPctOff;
  const midPctOff = store.midPctOff;
  const highPctOff = store.highPctOff;
  const lowProb = store.lowProb;
  const midProb = store.midProb;
  const highProb = store.highProb;
  const useWordGame = store.useWordGame;
  const useBirdGame = store.useBirdGame;
  const commissionAdjustedCurrSales = store.currSales * (commission / 100)
  const finalAdjustedCurrSales = (store.hasCoupon) ? commissionAdjustedCurrSales * ((100 - couponPct) / 100) : commissionAdjustedCurrSales

  const isLoading =
    ["loading", "submitting"].includes(nav.state) && nav.formMethod === "POST";

  const message = actionData?.message;

  useEffect(() => {
    if (message) {
      shopify.toast.show(message);
    }
  }, [message]);

  const [lowPercentage, setLowPercentage] = useState('' + Math.floor(lowPctOff * 100));
  const [midPercentage, setMidPercentage] = useState('' + Math.floor(midPctOff * 100));
  const [highPercentage, setHighPercentage] = useState('' + Math.floor(highPctOff * 100));

  const handlePctUpdate = (tier, value) => {
    switch (tier) {
      case 'Low':
        setLowPercentage(value);
        break;
      case 'Mid':
        setMidPercentage(value);
        break;
      case 'High':
        setHighPercentage(value);
        break;
      default:
        break;
    }
  };

  const [lowProbability, setLowProbability] = useState('' + Math.floor(lowProb * 100));
  const [midProbability, setMidProbability] = useState('' + Math.floor(midProb * 100));
  const [highProbability, setHighProbability] = useState('' + Math.floor(highProb * 100));

  const handleProbUpdate = (tier, value) => {
    switch (tier) {
      case 'Low':
        setLowProbability(value);
        break;
      case 'Mid':
        setMidProbability(value);
        break;
      case 'High':
        setHighProbability(value);
        break;
      default:
        break;
    }
  };

  const [wordGameActiveState, setWordGameActiveState] = useState(useWordGame);
  const [birdGameActiveState, setBirdGameActiveState] = useState(useBirdGame);

  const handleGameUpdate = (game, value) => {
    switch (game) {
      case 'Word Game':
        setWordGameActiveState(value === 'active');
        break;
      case 'Bird Game':
        setBirdGameActiveState(value === 'active');
        break;
      default:
        break;
    }
  }

  const [modalActive, setModalActive] = useState(false);

  const handleModalChange = () => {
    setModalActive(!modalActive);
  };

  const updatePopUp = () => {
    submit({
      lowPctOff: parseFloat(lowPercentage) / 100,
      midPctOff: parseFloat(midPercentage) / 100,
      highPctOff: parseFloat(highPercentage) / 100,
      lowProb: parseFloat(lowProbability) / 100,
      midProb: parseFloat(midProbability) / 100,
      highProb: parseFloat(highProbability) / 100,
      useWordGame: wordGameActiveState,
      useBirdGame: birdGameActiveState,
    }, { replace: true, method: "POST" });
  };

  return (
    <Page>
      <ui-title-bar title="PopGames">
        <button variant="primary" onClick={updatePopUp}>
          Save
        </button>
      </ui-title-bar>
      <Modal
        open={modalActive}
        onClose={handleModalChange}
        title="Video Tutorial"
        size="large"
        primaryAction={{
          content: 'Close',
          onAction: handleModalChange,
        }}
      >
        <Modal.Section>
          <iframe 
            height="500"
            src="https://www.youtube.com/embed/LqTryT9mS4g?si=A0UEsEE8ZC2YWuZF" 
            title="YouTube video player" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{ width: '100%', maxWidth: '100%' }}>
          </iframe>
        </Modal.Section>
      </Modal>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <GameSection
                game="Word Game"
                description="Guess the word to win"
                source="https://i.imgur.com/i7SL76B.png"
                width="275"
                height="315"
                gap="100"
                useGame={useWordGame}
                onGameUpdate={(value) => handleGameUpdate('Word Game', value)}
              />
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <GameSection
                game="Bird Game"
                description="Score 5 to win"
                source="https://i.imgur.com/jfa8UQt.png"
                width="275"
                height="315"
                gap="100"
                useGame={useBirdGame}
                onGameUpdate={(value) => handleGameUpdate('Bird Game', value)}
              />
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <BlockStack gap="200">
                <MediaCard
                  portrait
                  title="Add PopGames to your theme"
                  primaryAction={{
                    content: 'Preview in theme',
                    onAction: () => previewInTheme(store.shop, uuid),
                  }}
                  description={
                    <div>
                      <p>Watch this tutorial to learn how to add the PopGames pop-up app embed to your theme.</p>
                      <br/>
                      <p><b>Note:</b> The pop-up is now fully customizable within the theme editor.</p>
                    </div>
                  }
                  popoverAction={[{content: 'Dismiss', onAction: () => {}}]}
                >
                  <VideoThumbnail
                    videoLength={144}
                    thumbnailUrl="https://i.imgur.com/bfZIZx6.png"
                    onClick={handleModalChange}
                  />
                </MediaCard>
              </BlockStack>
            </BlockStack>
          </Layout.Section>
          <DiscountSection
            tier="Low"
            percentage={lowPctOff}
            probability={lowProb}
            onPctUpdate={(percentage) => handlePctUpdate('Low', percentage)}
            onProbUpdate={(probability) => handleProbUpdate('Low', probability)}
          />
          <DiscountSection
            tier="Mid"
            percentage={midPctOff}
            probability={midProb}
            onPctUpdate={(percentage) => handlePctUpdate('Mid', percentage)}
            onProbUpdate={(probability) => handleProbUpdate('Mid', probability)}
          />
          <DiscountSection
            tier="High"
            percentage={highPctOff}
            probability={highProb}
            onPctUpdate={(percentage) => handlePctUpdate('High', percentage)}
            onProbUpdate={(probability) => handleProbUpdate('High', probability)}
          />
          <Layout.Section variant="fullWidth">
            <SaveDiscountsButton isLoading={isLoading} updatePopUp={updatePopUp}/>
          </Layout.Section>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="200">
                <Text variant="headingLg" as="h5" fontWeight="semibold" alignment="center">
                  Total Sales (All Time)
                </Text>
                <Text variant="headingXl" as="h4" fontWeight="regular" alignment="center">
                  {store.totalSales.toFixed(2)} {store.currencyCode ? store.currencyCode : ''}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="200">
                <Text variant="headingLg" as="h5" fontWeight="semibold" alignment="center">
                  Total Sales (Period)
                </Text>
                <Text variant="headingXl" as="h4" fontWeight="regular" alignment="center">
                  {store.currSales.toFixed(2)} {store.currencyCode ? store.currencyCode : ''}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="fullWidth">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                      Your support team at PopGames
                    </Text>
                  </InlineStack>
                  <BlockStack gap="200">
                    <Divider />
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd">
                        Support
                      </Text>
                      <Badge>
                        Technical Support
                      </Badge>
                      <Link url="mailto:popgames.app@gmail.com" target="_blank">
                        popgames.app@gmail.com
                      </Link>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

const GameSection = ({ game, description, source, width, height, gap, useGame, onGameUpdate }) => {
  const [selected, setSelected] = useState(useGame ? 'active' : 'inactive');

  const handleSelectChange = useCallback(
    (value) => {
      setSelected(value);
      onGameUpdate(value);
    },
    [onGameUpdate],
  );

  const options = [
    {label: 'Active', value: 'active'},
    {label: 'Inactive', value: 'inactive'},
  ];

  return (
    <>
      <BlockStack gap={gap}>
        <Text as="h2" variant="headingLg" alignment="center">
          {game}
        </Text>
        <Text alignment="center">
          {description}
        </Text>
      </BlockStack>
      <BlockStack gap={gap}>
        <BlockStack inlineAlign="center">
          <Image
            source = {source}
            alt = "Word Game Image"
            width = {width}
            height = {height}
          />
        </BlockStack>
        <Select
          options={options}
          onChange={handleSelectChange}
          value={selected}
        />
      </BlockStack>
    </>
  )
}

const DiscountSection = ({ tier, percentage, probability, onPctUpdate, onProbUpdate }) => {
  const [pctValue, setPctValue] = useState('' + Math.floor(percentage * 100));
  const [probValue, setProbValue] = useState('' + Math.floor(probability * 100));

  const handlePctChange = useCallback(
    (newPctValue) => { 
      setPctValue(newPctValue);
      onPctUpdate(newPctValue);
    },
    [onPctUpdate],
  );

  const handleProbChange = useCallback(
    (newProbValue) => { 
      setProbValue(newProbValue);
      onProbUpdate(newProbValue);
    },
    [onProbUpdate],
  );

  return (
    <Layout.Section variant="oneThird">
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              {(tier == "Mid") ? "Medium" : tier} Discount
            </Text>
            <Text variant="heading3xl" as="h2" fontWeight="semibold" alignment="center">
              {pctValue}% Off
            </Text>
            <Text variant="headingLg" as="h5" fontWeight="regular" alignment="center">
              {probValue}% Chance
            </Text>
            <TextField
              label="Percent off"
              type="number"
              value={pctValue}
              onChange={handlePctChange}
              autoComplete="off"
            />
            <TextField
              label="Chance of occuring"
              type="number"
              value={probValue}
              onChange={handleProbChange}
              autoComplete="off"
            />
          </BlockStack>
        </Card>
      </BlockStack>
    </Layout.Section>
  )
}

function SaveDiscountsButton({ isLoading, updatePopUp }) {
  return <Button variant="primary" tone="success" loading={isLoading} onClick={updatePopUp} fullWidth>Save</Button>;
}

const previewInTheme = (shop, uuid) => {
  window.open(`https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${uuid}/pop-up`, '_blank');
}
