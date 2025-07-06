//go:build ignore

package wstest

import (
	"context"
	"testing"
	"time"

	spotws "github.com/openxapi/binance-go/ws/spot"
	"github.com/openxapi/binance-go/ws/spot/models"
)

func TestPing(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeNONE {
			continue // Skip non-public configs - ping is a public endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "Ping", testPing)
		})
	}
}

func TestServerTime(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeNONE {
			continue // Skip non-public configs - server time is a public endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "ServerTime", testServerTime)
		})
	}
}

func TestExchangeInfo(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeNONE {
			continue // Skip non-public configs - exchange info is a public endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "ExchangeInfo", testExchangeInfo)
		})
	}
}

func TestKlines(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeNONE {
			continue // Skip non-public configs - klines is a public endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "Klines", testKlines)
		})
	}
}

func TestUIKlines(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeNONE {
			continue // Skip non-public configs - UI klines is a public endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "UIKlines", testUIKlines)
		})
	}
}

func TestTicker(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeNONE {
			continue // Skip non-public configs - ticker is a public endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "Ticker", testTicker)
		})
	}
}

func Test24hrTicker(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeNONE {
			continue // Skip non-public configs - 24hr ticker is a public endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "24hrTicker", test24hrTicker)
		})
	}
}

func TestTickerPrice(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeNONE {
			continue // Skip non-public configs - ticker price is a public endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "TickerPrice", testTickerPrice)
		})
	}
}

func TestBookTicker(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeNONE {
			continue // Skip non-public configs - book ticker is a public endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "BookTicker", testBookTicker)
		})
	}
}

func TestTradingDay(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeNONE {
			continue // Skip non-public configs - trading day is a public endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "TradingDay", testTradingDay)
		})
	}
}

func TestDepth(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeNONE {
			continue // Skip non-public configs - depth is a public endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "Depth", testDepth)
		})
	}
}

func TestAvgPrice(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeNONE {
			continue // Skip non-public configs - avg price is a public endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "AvgPrice", testAvgPrice)
		})
	}
}

func TestTradesAggregate(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeNONE {
			continue // Skip non-public configs - aggregate trades is a public endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "TradesAggregate", testTradesAggregate)
		})
	}
}

func TestTradesHistorical(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeNONE {
			continue // Skip non-public configs - historical trades is a public endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "TradesHistorical", testTradesHistorical)
		})
	}
}

// Implementation functions
func testPing(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendPing(ctx, models.NewPingRequest(),
		func(response *models.PingResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testServerTime(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendTime(ctx, models.NewTimeRequest(),
		func(response *models.TimeResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testExchangeInfo(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendExchangeInfo(ctx, models.NewExchangeInfoRequest(),
		func(response *models.ExchangeInfoResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testKlines(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendKlines(ctx,
		models.NewKlinesRequest().
			SetSymbol("BTCUSDT").
			SetInterval("1m").
			SetLimit(100),
		func(response *models.KlinesResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testUIKlines(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendUiKlines(ctx,
		models.NewUiKlinesRequest().
			SetSymbol("BTCUSDT").
			SetInterval("1m").
			SetLimit(100),
		func(response *models.UiKlinesResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testTicker(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendTicker(ctx,
		models.NewTickerRequest().SetSymbol("BTCUSDT"),
		func(response *models.TickerResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func test24hrTicker(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendTicker24hr(ctx,
		models.NewTicker24hrRequest().SetSymbol("BTCUSDT"),
		func(response *models.Ticker24hrResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testTickerPrice(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendTickerPrice(ctx,
		models.NewTickerPriceRequest().SetSymbol("BTCUSDT"),
		func(response *models.TickerPriceResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testBookTicker(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendTickerBook(ctx,
		models.NewTickerBookRequest().SetSymbol("BTCUSDT"),
		func(response *models.TickerBookResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testTradingDay(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendTickerTradingDay(ctx,
		models.NewTickerTradingDayRequest().SetSymbol("BTCUSDT"),
		func(response *models.TickerTradingDayResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testDepth(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendDepth(ctx,
		models.NewDepthRequest().
			SetSymbol("BTCUSDT").
			SetLimit(100),
		func(response *models.DepthResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testAvgPrice(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendAvgPrice(ctx,
		models.NewAvgPriceRequest().SetSymbol("BTCUSDT"),
		func(response *models.AvgPriceResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testTradesAggregate(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendTradesAggregate(ctx,
		models.NewTradesAggregateRequest().
			SetSymbol("BTCUSDT").
			SetLimit(100),
		func(response *models.TradesAggregateResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testTradesHistorical(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendTradesHistorical(ctx,
		models.NewTradesHistoricalRequest().
			SetSymbol("BTCUSDT").
			SetLimit(100),
		func(response *models.TradesHistoricalResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}
