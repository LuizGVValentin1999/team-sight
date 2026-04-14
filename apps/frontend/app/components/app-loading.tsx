'use client';

import { Flex, Spin, Typography } from 'antd';

export function AppLoading() {
  return (
    <Flex className="app-loading" vertical align="center" justify="center" gap={12}>
      <Spin size="large" />
      <Typography.Text type="secondary">Carregando...</Typography.Text>
    </Flex>
  );
}
