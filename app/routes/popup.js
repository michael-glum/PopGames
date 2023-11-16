import { json } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";
import db from "../db.server.js"

export const action = async ({ request }) => {
    const url = new URL(request.url);
    const shop = url.searchParams.get('shop');
    const { email, getDiscountOptions, getGameOptions, getUserStats, setUserStats } = await request.json();
    const { admin } = await unauthenticated.admin(shop);

    if (email && !getUserStats && !setUserStats) {
        let customerResponse;
        let validEmailGiven = false;

        const existingCustomerResponse = await existingCustomer(email, admin)
        if (existingCustomerResponse) {
            if (existingCustomerResponse.node.emailMarketingConsent.marketingState === "NOT_SUBSCRIBED" ||
                existingCustomerResponse.node.emailMarketingConsent.marketingState === "UNSUBSCRIBED") {
                customerResponse = await updateEmailMarketingConsent(existingCustomerResponse.node.id, admin);
                validEmailGiven = true;
            }
        } else {
            customerResponse = await createCustomer(email, admin)
            validEmailGiven = true;
        }
        return json({ 
            email: email, 
            customerResponse: JSON.stringify(customerResponse),
            validEmailGiven: validEmailGiven
        })
    } else if (getDiscountOptions) {
        const discountOptions = await db.store.findFirst({ where: { shop: shop },
            select: {
                lowPctOff: true,
                midPctOff: true,
                highPctOff: true,
                lowProb: true,
                midProb: true,
                highProb: true,
            }
        })

        return json({
            discountOptions: discountOptions
        })
    } else if (getGameOptions) {
        const gameOptions = await db.store.findFirst({ where: { shop: shop },
            select: {
                useWordGame: true,
                useBirdGame: true,
            }
        })

        return json({
            gameOptions: gameOptions
        })
    } else if (email && getUserStats) {
        const userStats = await db.user.findUnique({ where: { email: email },
            select: {
                wordGamesPlayed: true,
                wordGamesTotal: true,
                wordGameBest: true,
                birdGamesPlayed: true,
                birdGamesTotal: true,
                birdGameBest: true,
            }
        });

        return json({
            userStats: userStats
        })
    } else if (email && setUserStats) {
        const game = setUserStats.game;
        const score = setUserStats.score;
        let updatedUserStats;

        if (game === 'wordGame') {
            let userStats = await db.user.findUnique({ where: { email: email },
                select: {
                    wordGamesPlayed: true,
                    wordGamesTotal: true,
                    wordGameBest: true,
                }
            });

            if (!userStats) {
                updatedUserStats = await db.user.create({
                    data: {
                        email: email,
                        wordGamesPlayed: 1,
                        wordGamesTotal: score,
                        wordGameBest: score
                    },
                    select: {
                        wordGamesPlayed: true,
                        wordGamesTotal: true,
                        wordGameBest: true,
                    }
                });
            } else {
                const updatedWordGameStats = await db.user.update({ where: { email: email },
                    data: {
                        wordGamesPlayed: userStats.wordGamesPlayed + 1,
                        wordGamesTotal: userStats.wordGamesTotal + score,
                        wordGameBest: Math.min(score, userStats.wordGameBest),
                    },
                    select: {
                        wordGamesPlayed: true,
                        wordGamesTotal: true,
                        wordGameBest: true,
                    }
                });

                updatedUserStats = updatedWordGameStats || userStats;
            }
        } else if (game === 'birdGame') {
            let userStats = await db.user.findUnique({ where: { email: email },
                select: {
                    birdGamesPlayed: true,
                    birdGamesTotal: true,
                    birdGameBest: true,
                }
            });

            if (!userStats) {
                updatedUserStats = await db.user.create({
                    data: {
                        email: email,
                        birdGamesPlayed: 1,
                        birdGamesTotal: score,
                        birdGameBest: score
                    },
                    select: {
                        birdGamesPlayed: true,
                        birdGamesTotal: true,
                        birdGameBest: true,
                    }
                });
            } else {
                const updatedBirdGameStats = await db.user.update({ where: { email: email },
                    data: {
                        birdGamesPlayed: userStats.birdGamesPlayed + 1,
                        birdGamesTotal: userStats.birdGamesTotal + score,
                        birdGameBest: Math.max(score, userStats.birdGameBest),
                    },
                    select: {
                        birdGamesPlayed: true,
                        birdGamesTotal: true,
                        birdGameBest: true,
                    }
                });

                updatedUserStats = updatedBirdGameStats || userStats;
            }
        }

        console.log("UpdatedUserStats: " + JSON.stringify(updatedUserStats));
        return json({
            updatedUserStats: updatedUserStats || null
        })
    }
}

async function existingCustomer(email, admin) {
    const response = await admin.graphql(
        `#graphql
            query queryCustomers($query: String!) {
                customers(first: 10, query: $query) {
                    edges {
                        node {
                            id
                            emailMarketingConsent {
                                ... on CustomerEmailMarketingConsentState {
                                    marketingState
                                }
                            }
                        }
                    }
                }
            }`,
        {
            variables: {
                "query": "email:" + email
            }
        }
    )
    const { data } = await response.json();
    const customerArray = data.customers.edges;
    return customerArray[0];
}

async function updateEmailMarketingConsent(existingCustomerId, admin) {
    const response = await admin.graphql(
        `#graphql
            mutation customerEmailMarketingConsentUpdate($input: CustomerEmailMarketingConsentUpdateInput!) {
                customerEmailMarketingConsentUpdate(input: $input) {
                    customer {
                        id
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }`,
        {
            variables: {
                "input": {
                    "customerId": existingCustomerId,
                    "emailMarketingConsent": {
                        "marketingState": "SUBSCRIBED",
                        "marketingOptInLevel": "SINGLE_OPT_IN"
                    }
                }
            }
        }
    )
    const responseJson = await response.json();
    return responseJson;
}

async function createCustomer(email, admin) {
    const response = await admin.graphql(
        `#graphql
            mutation customerCreate($input: CustomerInput!) {
                customerCreate(input: $input) {
                    customer {
                        email
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }`,
        {
            variables: {
                "input": {
                    "email": email,
                    "emailMarketingConsent": {
                        "marketingState": "SUBSCRIBED",
                        "marketingOptInLevel": "SINGLE_OPT_IN"
                    }
                }
            }
        }
    )
    const responseJson = await response.json();
    return responseJson;
}


